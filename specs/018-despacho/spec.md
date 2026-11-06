# Especificación 018 — Rondas de despacho y entrega

Fecha: 2026-11-05. Estado: **aprobada por el usuario (2026-11-05)**. Rama prevista: `feature-despacho`.

## Contexto

Con el 017 la cocina deja el pedido en `listo` y avisa por push. Este incremento cubre el resto del recorrido: el **repartidor** arma su propia ronda con pedidos `listo`, sale a entregarlos y marca cada uno como `entregado` o `no_entregado`. El cliente ve quién le lleva el pedido, cuánto falta y puede escribirle por WhatsApp.

## Alcance

1. Cola de despacho: los pedidos `listo` agrupados por zona, con la zona del pedido más antiguo primero.
2. Crear una ronda (repartidor): con la **sugerencia del sistema** (la zona del pedido `listo` más antiguo y los pedidos `listo` de esa zona) o con una **ruta propia** (el repartidor elige los pedidos, de una sola zona).
3. Entregar o marcar «no entregado» cada pedido de la ronda; la ronda se cierra sola al terminar.
4. Teléfono y nombre del personal; el cliente ve al repartidor, su botón de WhatsApp y la hora estimada mientras su pedido va en camino.
5. Canal en tiempo real para el repartidor (pedidos que quedan `listo`) y avisos al cliente y a la cocina en cada paso.

## Fuera de alcance

- Qué hacer con los pedidos `no_entregado` (reintento, reembolso, devolución al inventario): se define en un incremento posterior; por ahora es un estado final.
- Encuesta y métricas (019).
- Seguimiento del repartidor por GPS, rutas óptimas y hora estimada por zona (la hora estimada es una constante).
- Que `admin` u `operador` creen o modifiquen rondas (solo las consultan).
- Cambiar la cancelación del 016 (un pedido `en_camino` sigue sin poder cancelarse).

## Vocabulario

- **Ronda**: un viaje de un repartidor con de 1 a 5 pedidos de **una sola zona**. Crearla es salir: los pedidos pasan a `en_camino` en ese momento.
- **Ronda activa**: la que todavía tiene algún pedido `en_camino`.
- **Sugerencia**: el grupo que propone el sistema: la zona del pedido `listo` más antiguo (por número de pedido) y hasta 5 de los más antiguos de esa zona.
- **Ruta propia**: el grupo que elige el repartidor entre los pedidos `listo`, siempre de una sola zona.
- **Zona de un pedido**: la zona a la que pertenece su punto de entrega en el momento de armar la ronda.

## Decisiones de diseño propuestas

Esta sección existe para que las revises junto con el resto de la spec.

1. **Crear la ronda es salir.** No hay un estado intermedio «armada»: al crearla, los pedidos pasan a `en_camino` y se fija la hora estimada. Así hay un solo paso y no quedan pedidos reservados que nadie lleva.
2. **Límites.** Máximo 5 pedidos por ronda y 2 rondas activas por repartidor, es decir, como máximo 10 pedidos en reparto por repartidor.
3. **Sin choques entre repartidores.** La sugerencia salta los pedidos que otro repartidor está tomando en ese instante (`FOR UPDATE SKIP LOCKED`), de modo que dos repartidores que piden la sugerencia a la vez reciben grupos distintos. Si eligen pedidos concretos y uno ya fue tomado, el segundo recibe `409`.
4. **«Más antiguo» es por número de pedido** (orden de creación), no por la hora en que quedó `listo`.
5. **Personal con nombre y teléfono.** Se agregan `phone` y `fullName` a `users` (para clientes siguen viniendo de `customers`). Son obligatorios para el rol `repartidor`: sin ellos no puede crear rondas. El cliente ve el nombre, el teléfono y el enlace de WhatsApp del repartidor solo mientras su pedido está `en_camino`.
6. **`no_entregado` es un estado final nuevo**, con motivo obligatorio. No devuelve inventario ni reembolsa (la comida ya se preparó); eso se decidirá después.
7. **Canal propio del repartidor** (`GET /dispatch/stream`): recibe los avisos de todos los pedidos, igual que la cocina, para ver cuándo aparece un pedido `listo` sin consultar.

## Estados

`recibido → en_preparacion → listo → en_camino → entregado | no_entregado`, y `cancelado` desde `recibido` o `en_preparacion`. `entregado` y `no_entregado` son finales.

## Modelo de datos

`dispatch_rounds`:

| Columna       | Tipo        | Regla                                                           |
| ------------- | ----------- | --------------------------------------------------------------- |
| `id`          | uuid        | PK                                                              |
| `courier_id`  | uuid        | FK a `users`, `RESTRICT`                                        |
| `zone_id`     | uuid        | FK a `delivery_zones`, `RESTRICT`                               |
| `zone_name`   | varchar     | Copia de la zona al crear la ronda                              |
| `status`      | varchar(10) | `activa` o `finalizada`; CHECK                                  |
| `eta_at`      | timestamptz | Salida + 15 minutos (constante)                                 |
| `started_at`  | timestamptz | Hora de salida                                                  |
| `finished_at` | timestamptz | `NULL` mientras esté activa; CHECK de consistencia con `status` |

Cambios en tablas existentes:

- `orders`: `round_id` (uuid, nullable, FK a `dispatch_rounds` `RESTRICT`, con índice), `failure_reason` (varchar(200), nullable) y el CHECK de estado suma `no_entregado`. CHECK: `failure_reason` solo existe si el estado es `no_entregado` y es obligatorio en ese estado.
- `users`: `phone` (varchar(16), nullable, mismo formato E.164 que `customers`) y `full_name` (varchar(80), nullable, 2 a 80 caracteres con algún carácter visible).
- `order_events`: acepta el estado nuevo.

## Reglas de negocio

- **RN-81 — Quién actúa.** Crear rondas, entregar y marcar «no entregado» es solo del rol `repartidor`. `cliente` recibe `403` en todas las rutas de `/dispatch`; `admin` y `operador` pueden consultar (cola y rondas) pero no actuar (`403`). Sin sesión `401`. La autorización va antes de cualquier otra validación.
- **RN-82 — Repartidor completo.** Para crear una ronda el repartidor debe tener `phone` y `fullName`; si no, `409` indicando qué falta.
- **RN-83 — Cola de despacho.** `GET /dispatch/queue` devuelve los pedidos `listo` agrupados por zona: las zonas se ordenan por su pedido más antiguo y dentro de cada zona los pedidos van del más antiguo al más nuevo. Marca cuál es la zona sugerida (la primera) y trae los pedidos con la vista del 016, más el nombre y el teléfono del cliente. Sin costos.
- **RN-84 — Crear la ronda.** `POST /dispatch/rounds` con `orderIds` opcional:
  - Sin `orderIds` (sugerencia): se toma la zona del pedido `listo` más antiguo disponible y hasta 5 de los más antiguos de esa zona. Si no hay pedidos `listo` → `409`.
  - Con `orderIds` (ruta propia): de 1 a 5 identificadores distintos. Cada pedido debe existir (`404`), estar `listo` (`409`) y todos deben ser de la misma zona (`409` indicando las zonas).
- **RN-85 — Límite de rondas.** Un repartidor puede tener como máximo 2 rondas activas; la tercera → `409`.
- **RN-86 — Salir.** Al crear la ronda, todos sus pedidos pasan a `en_camino`, cada uno con su evento (autor: el repartidor), y se fija `eta_at` = ahora + 15 minutos. Es una sola transacción: o salen todos o ninguno.
- **RN-87 — Concurrencia.** Los pedidos se bloquean en una sola transacción: ningún pedido puede quedar en dos rondas. Con sugerencia, los pedidos tomados por otro repartidor en ese instante se saltan; con pedidos concretos, el que ya no esté `listo` da `409` y no se crea nada.
- **RN-88 — Entregar.** `POST /dispatch/orders/:id/deliver` pasa el pedido de `en_camino` a `entregado`. El pedido debe pertenecer a una ronda **propia**; si es de otro repartidor o no existe → `404`; si no está `en_camino` → `409`.
- **RN-89 — No entregado.** `POST /dispatch/orders/:id/fail` con `reason` (obligatorio, 1 a 200 caracteres con algún carácter visible) pasa el pedido a `no_entregado`. Mismas reglas de pertenencia y estado que `deliver`. No mueve el inventario ni el pago.
- **RN-90 — Cierre de la ronda.** Cuando ningún pedido de la ronda sigue `en_camino`, la ronda pasa a `finalizada` con `finished_at`. Se hace en la misma transacción del último pedido.
- **RN-91 — Estados finales.** Un pedido `entregado` o `no_entregado` no cambia más; intentarlo → `409`.
- **RN-92 — Lo que ve el cliente.** Mientras su pedido está `en_camino`, `delivery.courier` trae `{ fullName, phone, whatsappUrl }` (con `whatsappUrl = https://wa.me/<dígitos del teléfono sin el +>`) y `delivery.etaAt` la hora estimada. En cualquier otro estado ambos son `null`. Un pedido `no_entregado` muestra su `failureReason`.
- **RN-93 — Teléfono y nombre del personal.** `POST /users` con rol `repartidor` exige `phone` y `fullName`; cambiar a alguien al rol `repartidor` exige que ya los tenga (`400` si no); `PATCH /users/:id` puede editarlos (solo `admin`). Para los otros roles son opcionales. `GET /users` y `GET /users/:id` los devuelven también para el personal. El seed del repartidor de demostración trae valores de ejemplo.
- **RN-94 — Consulta de rondas.** `GET /dispatch/rounds` devuelve al repartidor sus rondas (por defecto las activas; filtro `status`) y a `admin` y `operador` todas, paginadas, la más reciente primero. `GET /dispatch/rounds/:id` devuelve el detalle con sus pedidos; un repartidor solo ve las suyas (`404` en las ajenas). Un pedido de un repartidor trae el nombre y el teléfono del cliente para poder entregarlo.
- **RN-95 — Avisos.** Cada cambio (`en_camino`, `entregado`, `no_entregado`) emite el aviso del 017 dentro de la transacción: el cliente recibe el de su pedido y la cocina y el repartidor reciben todos.
- **RN-96 — Canal del repartidor.** `GET /dispatch/stream`, solo `repartidor`; mismo formato, latido, verificación de sesión y límites que los canales del 017 (RN-76 a RN-79). `admin` y `operador` ya tienen el de la cocina.
- **RN-97 — Cabeceras.** `Cache-Control: no-store` en `/dispatch`.
- **RN-98 — Errores.** Orden: `401 → 403 → 400 → 404 → 409`; límites de canales y aperturas `429`.

## Contratos

### `GET /dispatch/queue` (repartidor, operador, admin)

`200`:

```json
{
  "suggestedZoneId": "uuid",
  "zones": [
    {
      "zoneId": "uuid",
      "zoneName": "Zona 1",
      "oldestNumber": 1042,
      "orders": [
        { "...": "vista de pedido del 016, con customer { name, phone }" }
      ]
    }
  ]
}
```

Sin pedidos `listo`: `{ "suggestedZoneId": null, "zones": [] }`.

### `POST /dispatch/rounds` (repartidor)

Cuerpo opcional: `{ "orderIds": ["uuid", "…"] }`. Respuesta `201` con la ronda:

```json
{
  "id": "uuid",
  "status": "activa",
  "zone": { "id": "uuid", "name": "Zona 1" },
  "courier": {
    "id": "uuid",
    "fullName": "Carlos Gómez",
    "phone": "+573001112233"
  },
  "startedAt": "…",
  "etaAt": "…",
  "finishedAt": null,
  "orders": [{ "...": "vista de pedido, ahora en_camino" }]
}
```

### Otras operaciones

- `GET /dispatch/rounds?page=&limit=&status=` → `200` paginado.
- `GET /dispatch/rounds/:id` → `200`.
- `POST /dispatch/orders/:id/deliver` → `200` con el pedido.
- `POST /dispatch/orders/:id/fail` con `{ "reason" }` → `200` con el pedido.
- `GET /dispatch/stream` → `200` `text/event-stream`.

Operaciones nuevas (7): `GET /dispatch/queue`, `POST /dispatch/rounds`, `GET /dispatch/rounds`, `GET /dispatch/rounds/{id}`, `POST /dispatch/orders/{id}/deliver`, `POST /dispatch/orders/{id}/fail`, `GET /dispatch/stream`. Total: 50.

## Decisiones confirmadas por el usuario

1. El repartidor arma su propia ronda, con prioridad para la zona del pedido `listo` más antiguo, y también puede crear su propia ruta.
2. La hora estimada es una constante (15 minutos).
3. Se agrega el teléfono del repartidor.
4. El repartidor solo marca `entregado` o `no_entregado`; qué hacer con los `no_entregado` se decide después.
5. Un repartidor puede tener como máximo 2 rondas activas (hasta 10 pedidos en reparto).

## Criterios de aceptación

| ID    | Escenario                                                                                           | Resultado                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-01 | Aplicar y revertir la migración                                                                     | Crea `dispatch_rounds` y las columnas nuevas; `down()` aborta si hay rondas o repartidores con datos nuevos y, sin ellos, deja el esquema anterior       |
| CA-02 | Violar restricciones directamente en la base                                                        | Rechaza estado de ronda inválido, ronda finalizada sin `finished_at`, `failure_reason` sin `no_entregado` (y al revés), teléfono no E.164 y nombre vacío |
| CA-03 | Repartidor pide la cola con pedidos `listo` de varias zonas                                         | Zonas ordenadas por su pedido más antiguo, pedidos del más antiguo al más nuevo, zona sugerida marcada; sin costos                                       |
| CA-04 | Cola sin pedidos `listo`                                                                            | `200` con `suggestedZoneId` nulo y sin zonas                                                                                                             |
| CA-05 | Repartidor crea la ronda con la sugerencia                                                          | `201`; toma la zona del pedido más antiguo y hasta 5 de esa zona; los pedidos quedan `en_camino` con evento y `etaAt` = salida + 15 min                  |
| CA-06 | Sugerencia con más de 5 pedidos en la zona                                                          | Toma solo los 5 más antiguos; el resto sigue `listo`                                                                                                     |
| CA-07 | Sugerencia sin pedidos `listo`                                                                      | `409`                                                                                                                                                    |
| CA-08 | Ruta propia con pedidos de una sola zona                                                            | `201` con exactamente esos pedidos                                                                                                                       |
| CA-09 | Ruta propia con zonas mezcladas, más de 5 pedidos, repetidos, vacía, mal formada o con campos extra | `409` para zonas mezcladas; `400` para el resto; nada cambia                                                                                             |
| CA-10 | Ruta propia con un pedido inexistente o no `listo`                                                  | `404` / `409`; no se crea la ronda ni se mueve ningún pedido                                                                                             |
| CA-11 | Repartidor con dos rondas activas intenta una tercera                                               | `409`; al cerrar una, puede crear otra                                                                                                                   |
| CA-12 | Repartidor sin teléfono o sin nombre                                                                | `409` indicando qué falta                                                                                                                                |
| CA-13 | Roles distintos en las rutas de acción; `admin` y `operador` consultan                              | `cliente` `403` en todo `/dispatch`; `admin` y `operador` `403` al actuar y `200` al consultar; sin sesión `401`                                         |
| CA-14 | Dos repartidores piden la sugerencia a la vez con pedidos para dos grupos                           | Reciben grupos distintos; ningún pedido en dos rondas                                                                                                    |
| CA-15 | Dos repartidores eligen el mismo pedido a la vez                                                    | Uno recibe `201` y el otro `409`; un solo evento `en_camino`                                                                                             |
| CA-16 | Repartidor entrega un pedido de su ronda                                                            | `200`, `entregado`, evento con autor y hora                                                                                                              |
| CA-17 | Repartidor marca «no entregado» con motivo (y sin motivo)                                           | `200` y `no_entregado` con `failureReason`; sin motivo `400`; el inventario y el pago no cambian                                                         |
| CA-18 | Entregar o fallar un pedido ajeno, inexistente, no `en_camino` o ya final                           | `404` (ajeno o inexistente) o `409`; sin cambios                                                                                                         |
| CA-19 | Último pedido de la ronda entregado o fallado                                                       | La ronda pasa a `finalizada` con `finishedAt`; con pedidos pendientes sigue `activa`                                                                     |
| CA-20 | Cliente consulta su pedido `en_camino`, luego `entregado`                                           | En camino: nombre, teléfono, `whatsappUrl` y `etaAt`; después: `null` en los tres                                                                        |
| CA-21 | Consulta de rondas y detalle                                                                        | El repartidor ve solo las suyas (la ajena es `404`); `admin` y `operador` ven todas; paginado y filtro `status`                                          |
| CA-22 | Crear repartidor sin teléfono o nombre; cambiar un usuario sin datos a repartidor                   | `400`; con los datos, `201` / `200`; `GET /users` los devuelve para el personal                                                                          |
| CA-23 | Avisos en tiempo real                                                                               | Cliente: recibe `en_camino`, `entregado` o `no_entregado` de sus pedidos; cocina y repartidor: reciben todos                                             |
| CA-24 | Canal del repartidor y roles equivocados                                                            | `repartidor` abre el canal; `cliente`, `admin` y `operador` `403`; mismos límites que los canales del 017                                                |
| CA-25 | Cabeceras                                                                                           | `Cache-Control: no-store` en todas las rutas de `/dispatch`; el canal con `text/event-stream`                                                            |
| CA-26 | Swagger JSON                                                                                        | Exactamente 50 operaciones; el canal documentado como `text/event-stream`                                                                                |
| CA-27 | Cobertura global                                                                                    | ≥ 80 % en líneas, sentencias, funciones y ramas                                                                                                          |

## Trazabilidad (prevista)

| Criterio                   | Prueba                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| CA-01, CA-02               | `test/database/dispatch-migration.e2e-spec.ts`                                               |
| CA-03, CA-04, CA-13, CA-21 | `test/database/dispatch-read.e2e-spec.ts`                                                    |
| CA-05 a CA-12              | `test/database/dispatch-rounds.e2e-spec.ts`                                                  |
| CA-14, CA-15               | `test/database/dispatch-concurrency.e2e-spec.ts`                                             |
| CA-16 a CA-20              | `test/database/dispatch-delivery.e2e-spec.ts`                                                |
| CA-22                      | `test/database/users.e2e-spec.ts` (ampliada)                                                 |
| CA-23 a CA-25              | `test/database/dispatch-streams.e2e-spec.ts`                                                 |
| CA-26                      | `test/swagger.e2e-spec.ts`                                                                   |
| Funciones puras            | `test/unit/dispatch-calculations.spec.ts` (agrupar por zona, sugerencia, enlace de WhatsApp) |
| CA-27                      | `npm run test:cov`                                                                           |
