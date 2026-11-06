# Especificación 016 — Pedidos con pago de demostración

Fecha: 2026-11-05. Estado: **aprobada por el usuario (2026-11-05)**. Rama prevista: `feature-pedidos`.

## Contexto

Con el menú (014) y los puntos de entrega (015) el cliente ya puede ver qué pedir y dónde recibir. Este incremento crea el **pedido**: el cliente arma su compra, elige punto, piso e indicación, paga con una tarjeta de demostración y el sistema registra el pedido y descuenta el inventario en la misma operación, usando el historial de movimientos que ya existe.

## Alcance

1. Crear un pedido (`POST /orders`, solo `cliente`) con pago de demostración.
2. Descontar el saldo al pagar, con movimientos `OUT` ligados al pedido, y devolverlo al cancelar con movimientos `IN`.
3. Consultar pedidos: el cliente los suyos; `admin` y `operador` todos.
4. Cancelar un pedido (reglas por rol y estado).
5. Historial de estados con la hora de cada cambio, como base del seguimiento.

Rutas relativas a `/api/v1`. Pasa de 34 a **38 operaciones**. Sin dependencias ni variables de entorno nuevas.

Fuera de alcance:

- Cambiar el pedido a `en_preparacion`, `listo` (cocina, 017) y `en_camino`, `entregado` (reparto, 018). Este incremento define esos estados y sus reglas de cancelación, pero solo produce `recibido` y `cancelado`.
- Hora estimada («llega en unos 15 min»), teléfono del repartidor y botón de WhatsApp (018).
- Pago real, propinas, cupones, costo de domicilio y pedidos programados.
- Que el `repartidor` consulte pedidos (018, según su ronda).

## Vocabulario

- **Pedido**: compra de un cliente con una o más líneas, un punto de entrega y un pago aprobado.
- **Línea**: un producto del menú (simple o combo) con su cantidad.
- **Pago de demostración**: simulación de cobro con tarjeta de prueba; no hay pasarela ni datos reales.
- **Número de pedido**: consecutivo legible (empieza en 1001) para que cocina y cliente se entiendan.

## Estados

`recibido → en_preparacion → listo → en_camino → entregado`, y `cancelado` desde `recibido` o `en_preparacion`. Un pedido nace `recibido` con el pago aprobado.

## Modelo de datos

Se guarda una **copia** de lo que el cliente compró (nombre, precio y costo de cada línea, nombre del punto y de la zona) para que cambios posteriores del menú o de las zonas no alteren pedidos viejos.

`orders`:

| Columna                         | Tipo               | Regla                                                                 |
| ------------------------------- | ------------------ | --------------------------------------------------------------------- |
| `id`                            | uuid               | PK                                                                    |
| `number`                        | integer            | Único; secuencia desde 1001                                           |
| `customer_id`                   | uuid               | FK a `customers(user_id)`, `RESTRICT`                                 |
| `status`                        | varchar(16)        | Uno de los seis estados; CHECK                                        |
| `point_id`                      | uuid               | FK a `delivery_points`, `RESTRICT`                                    |
| `point_name`, `zone_name`       | varchar            | Copia al momento del pedido                                           |
| `floor`                         | smallint           | 1 a 30 o `NULL` (punto sin pisos)                                     |
| `delivery_note`                 | varchar(200)       | Indicación del cliente para encontrarlo; opcional                     |
| `note`                          | varchar(200)       | Nota del pedido para la cocina («sin azúcar»); opcional               |
| `total`                         | integer            | Suma de las líneas, de 1 a 200.000 COP; CHECK                         |
| `payment_method`                | varchar(16)        | `tarjeta_demo`                                                        |
| `payment_last4`                 | char(4)            | Últimos cuatro dígitos; el número completo nunca se guarda            |
| `payment_status`                | varchar(12)        | `aprobado` o `reembolsado`                                            |
| `idempotency_key`               | uuid               | Único por cliente                                                     |
| `request_hash`                  | char(64)           | Huella del contenido, para detectar la misma clave con otro contenido |
| `cancel_reason`, `cancelled_by` | varchar(200), uuid | Motivo y usuario que canceló; `NULL` si no se canceló                 |
| `created_at` / `updated_at`     | timestamptz        | Como el resto de tablas                                               |

`order_items`: `id`, `order_id` (FK `RESTRICT`), `product_id` (FK `RESTRICT`), `sku`, `name`, `category`, `quantity` (1 a 10), `unit_price`, `unit_cost` (copia; en un combo, el costo calculado), `line_total`.

`order_item_components` (solo para combos): `item_id`, `product_id`, `sku`, `name`, `quantity` por unidad del combo. La cocina (017) sabe así qué preparar sin consultar el menú.

`order_events`: `id`, `order_id`, `status`, `user_id`, `created_at`. Una fila por cambio de estado (la primera, `recibido`).

`stock_movements` suma `order_id` (uuid, nullable, FK a `orders` `RESTRICT`, con índice). Los movimientos manuales lo dejan `NULL`.

## Reglas de negocio

- **RN-49 — Solo clientes compran.** `POST /orders` es solo del rol `cliente`; los demás roles reciben `403`, sin sesión `401`.
- **RN-50 — Contenido.** De 1 a 10 líneas con productos distintos (un `productId` repetido → `400`), cantidad entera de 1 a 10. El cliente no envía precios: el servidor los toma del menú vigente.
- **RN-51 — Productos vendibles.** Cada producto debe existir (`404`) y estar disponible según el menú (activo, no agotado y con saldo; en un combo, saldo de todos sus componentes) o la respuesta es `409` con el nombre del producto. Un combo se descuenta por sus componentes × cantidad.
- **RN-52 — Total.** El total es la suma de `precio × cantidad` y debe ser mayor que 0 y no superar 200.000 COP; si lo supera → `400`. No hay pedido mínimo.
- **RN-53 — Punto y piso.** El punto debe existir (`404`) y estar activo con su zona activa (`409` si no). Si el punto tiene pisos, `floor` es obligatorio y va de 1 al número de pisos; si no tiene pisos, `floor` no se envía (en ambos casos de error → `400`). La zona del pedido es la del punto.
- **RN-54 — Indicaciones.** `deliveryNote` (indicación para ubicar al cliente) y `note` (nota de cocina) son opcionales, de 1 a 200 caracteres con algún carácter visible.
- **RN-55 — Pago de demostración.** El cuerpo trae `payment: { method: "tarjeta_demo", cardNumber }`. Solo existen dos tarjetas de prueba: `4242424242424242` **aprueba** y `4000000000000002` **rechaza**. Cualquier otro número → `400`. Un rechazo responde `402` con «Pago rechazado.», **no crea el pedido ni mueve el saldo** y tampoco se guarda nada del intento. El número completo no se registra en ningún lado (ni en la base de datos ni en las respuestas; la API no imprime el cuerpo de las peticiones); solo `payment_last4`.
- **RN-56 — Descuento de saldo.** Con el pago aprobado, en una sola transacción se crea el pedido y, por cada producto simple (los componentes de cada combo expandidos y sumados), un movimiento `OUT` con razón «Pedido #1042», el cliente como autor y `order_id`. Los productos se bloquean en orden de id para que pedidos simultáneos no se interbloqueen. Si cualquiera no tiene saldo → `409` con el nombre del producto y no queda nada a medias.
- **RN-57 — Idempotencia.** `POST /orders` exige el encabezado `Idempotency-Key` (UUID). Repetir la misma clave con el mismo contenido devuelve el pedido ya creado con `200` (sin cobrar ni descontar de nuevo); la misma clave con otro contenido → `409`. Dos peticiones simultáneas con la misma clave crean un solo pedido.
- **RN-58 — Número y estado inicial.** El pedido nace `recibido`, con número consecutivo, `payment_status` `aprobado` y su primer evento.
- **RN-59 — Cancelación.** `POST /orders/:id/cancel`: el cliente solo cancela **su** pedido y solo en `recibido`; `admin` y `operador` cancelan cualquiera en `recibido` o `en_preparacion` y deben enviar `reason` (1 a 200). Fuera de esos estados → `409`. Al cancelar: el estado pasa a `cancelado`, `payment_status` a `reembolsado`, se registra el evento y se devuelve el saldo con un movimiento `IN` por cada `OUT` del pedido («Cancelación del pedido #1042»).
- **RN-60 — Consultas.** `GET /orders` lista del más reciente al más antiguo, paginado; el cliente ve solo los suyos y `admin` y `operador` todos, con filtro opcional `status`. `GET /orders/:id`: el cliente solo el suyo (de otro cliente → `404`, para no revelar que existe); `admin` y `operador` cualquiera. El `repartidor` recibe `403` en las tres rutas de lectura y cancelación.
- **RN-61 — Historial.** Cada pedido devuelve sus eventos `{status, at}` en orden, de modo que el cliente ve cuándo cambió.
- **RN-62 — Movimientos ligados.** `GET /movements` muestra `orderId` en cada movimiento (`null` si es manual). `POST /movements` no cambia.
- **RN-63 — Sin caché y con límite.** Las rutas de `/orders` llevan `Cache-Control: no-store`. `POST /orders` admite 10 peticiones por minuto por IP.

## Contratos

### `POST /orders` (cliente)

Encabezado `Idempotency-Key: <uuid>`.

```json
{
  "items": [{ "productId": "uuid", "quantity": 2 }],
  "pointId": "uuid",
  "floor": 2,
  "deliveryNote": "Junto a la entrada del salón 302",
  "note": "Sin azúcar",
  "payment": { "method": "tarjeta_demo", "cardNumber": "4242424242424242" }
}
```

Respuesta `201` (o `200` si es una repetición):

```json
{
  "id": "uuid",
  "number": 1001,
  "status": "recibido",
  "total": 9000,
  "items": [
    {
      "productId": "uuid",
      "sku": "CAF-CAPU",
      "name": "Capuchino (caliente)",
      "category": "cafe",
      "quantity": 2,
      "unitPrice": 4500,
      "lineTotal": 9000,
      "components": []
    }
  ],
  "delivery": {
    "pointId": "uuid",
    "pointName": "Edificio A",
    "zoneName": "Zona 1",
    "floor": 2,
    "deliveryNote": "Junto a la entrada del salón 302"
  },
  "note": "Sin azúcar",
  "payment": {
    "method": "tarjeta_demo",
    "last4": "4242",
    "status": "aprobado"
  },
  "customer": { "name": "Ana Pérez", "phone": "+573001112233" },
  "cancelReason": null,
  "events": [{ "status": "recibido", "at": "2026-11-05T17:00:00.000Z" }],
  "createdAt": "…",
  "updatedAt": "…"
}
```

El costo de cada línea es dato interno: no aparece en ninguna respuesta de pedidos.

### Otras operaciones

- `GET /orders?page=&limit=&status=` → `200` con `{data, page, limit, total, totalPages}`.
- `GET /orders/:id` → `200`.
- `POST /orders/:id/cancel` con `{ "reason"? }` (obligatorio para `admin` y `operador`) → `200` con el pedido.

Errores: `401 → 403 → 400 → 404 → 409`; el rechazo del pago es `402` y el límite de peticiones `429`.

Operaciones nuevas (4): `POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`.

## Decisiones confirmadas por el usuario

1. El saldo baja al pagar el pedido (no al preparar).
2. El pago de demostración rechaza con una tarjeta de prueba para poder probar el flujo fallido.
3. El cliente cancela solo en `recibido`; `admin` y `operador` hasta `en_preparacion`, con motivo.
4. Sin pedido mínimo; máximo de 200.000 COP.

## Criterios de aceptación

| ID    | Escenario                                                                                       | Resultado                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| CA-01 | Aplicar y revertir la migración                                                                 | Crea tablas, secuencia, columna `order_id` y restricciones; `down()` aborta si hay pedidos y, sin ellos, deja el esquema anterior                |
| CA-02 | Violar restricciones directamente en la base                                                    | Rechaza estado inválido, total fuera de 1 a 200.000, cantidad fuera de 1 a 10, piso fuera de 1 a 30 y clave de idempotencia repetida por cliente |
| CA-03 | Cliente crea un pedido válido (simple y combo)                                                  | `201` con número, totales y copia de nombres y precios; `recibido`; un evento; sin costos en la respuesta                                        |
| CA-04 | Tras CA-03 se consulta el saldo                                                                 | Bajó lo comprado; el combo descontó cada componente × cantidad; hay un `OUT` por producto con razón «Pedido #…», autor cliente y `orderId`       |
| CA-05 | Roles distintos de `cliente` en `POST /orders`; sin sesión                                      | `403` y `401`, sin cambios; la autorización va antes de validar el cuerpo                                                                        |
| CA-06 | Cuerpos inválidos (líneas vacías o más de 10, cantidad 0 u 11, producto repetido, campos extra) | `400` sin efectos                                                                                                                                |
| CA-07 | Producto inexistente; inactivo; agotado; combo con un componente sin saldo                      | `404` o `409` con el nombre; sin pedido ni movimientos                                                                                           |
| CA-08 | Total superior a 200.000 COP                                                                    | `400`; nada cambia                                                                                                                               |
| CA-09 | Punto inexistente, inactivo o con zona inactiva                                                 | `404` o `409`                                                                                                                                    |
| CA-10 | Piso en punto con pisos (faltante, 0 o mayor que `floors`) y piso en punto sin pisos            | `400` en los cuatro casos; piso válido → `201`                                                                                                   |
| CA-11 | Tarjeta `4000000000000002`                                                                      | `402`; no hay pedido, no se movió el saldo y no se consumió la clave de idempotencia                                                             |
| CA-12 | Tarjeta desconocida o con formato inválido                                                      | `400`                                                                                                                                            |
| CA-13 | El número de tarjeta no se guarda                                                               | La base solo contiene `last4`; ninguna respuesta lo contiene (la API no registra el cuerpo de las peticiones)                                    |
| CA-14 | Saldo insuficiente en un producto de un pedido de varios                                        | `409` con el nombre; el saldo de todos los productos queda intacto                                                                               |
| CA-15 | Sin encabezado `Idempotency-Key` o con valor no UUID                                            | `400`                                                                                                                                            |
| CA-16 | Misma clave y mismo contenido                                                                   | `200` con el mismo pedido; el saldo no vuelve a bajar                                                                                            |
| CA-17 | Misma clave con otro contenido                                                                  | `409`                                                                                                                                            |
| CA-18 | Diez peticiones simultáneas con la misma clave                                                  | Un solo pedido, un solo juego de movimientos; las demás reciben el mismo pedido (`200`)                                                          |
| CA-19 | Dos clientes compran a la vez la última unidad                                                  | Uno recibe `201` y el otro `409`; el saldo nunca queda negativo ni hay `500`                                                                     |
| CA-20 | Cliente consulta lista y detalle; intenta ver el pedido de otro                                 | Ve solo los suyos, del más reciente al más antiguo, paginados; el ajeno responde `404`                                                           |
| CA-21 | Admin y operador consultan; filtro por estado; repartidor                                       | Ven todos los pedidos con datos del cliente; el filtro funciona; el repartidor recibe `403`                                                      |
| CA-22 | Cliente cancela su pedido `recibido`                                                            | `200`, `cancelado`, pago `reembolsado`, evento nuevo y el saldo restituido con movimientos `IN`                                                  |
| CA-23 | Cancelar un pedido ya cancelado, ajeno o en un estado no cancelable                             | `409`, `404` o `409` según el caso, sin tocar el saldo                                                                                           |
| CA-24 | Admin y operador cancelan en `recibido` y en `en_preparacion`                                   | `200` con motivo obligatorio (`400` sin él); el saldo se restituye                                                                               |
| CA-25 | Cancelaciones simultáneas del mismo pedido                                                      | Una gana; el saldo se restituye una sola vez                                                                                                     |
| CA-26 | `GET /movements` tras un pedido y una cancelación                                               | Muestra `orderId` en los movimientos del pedido y `null` en los manuales; `POST /movements` sigue igual                                          |
| CA-27 | Cabeceras y límite                                                                              | `Cache-Control: no-store` en todas las rutas de pedidos; `429` tras 10 `POST /orders` por minuto por IP                                          |
| CA-28 | Swagger JSON                                                                                    | Exactamente 38 operaciones; `POST /orders` documenta `402` y el encabezado de idempotencia                                                       |
| CA-29 | Cobertura global                                                                                | ≥ 80 % en líneas, sentencias, funciones y ramas                                                                                                  |

## Trazabilidad (prevista)

| Criterio             | Prueba                                                                      |
| -------------------- | --------------------------------------------------------------------------- |
| CA-01, CA-02         | `test/database/orders-migration.e2e-spec.ts`                                |
| CA-03 a CA-17        | `test/database/orders.e2e-spec.ts`                                          |
| CA-18, CA-19, CA-25  | `test/database/orders-concurrency.e2e-spec.ts`                              |
| CA-20 a CA-24, CA-26 | `test/database/orders-read-cancel.e2e-spec.ts`                              |
| CA-27                | `test/database/orders.e2e-spec.ts`                                          |
| CA-28                | `test/swagger.e2e-spec.ts`                                                  |
| Funciones puras      | `test/unit/order-calculations.spec.ts` (expansión de combos, total, huella) |
| CA-29                | `npm run test:cov`                                                          |
