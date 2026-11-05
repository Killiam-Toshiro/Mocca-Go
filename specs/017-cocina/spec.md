# Especificación 017 — Órdenes de cocina y notificaciones en tiempo real

Fecha: 2026-11-05. Estado: **aprobada por el usuario (2026-11-05)**. Rama prevista: `feature-cocina`.

## Contexto

Con el 016 el pedido nace `recibido` y descuenta el inventario, pero nadie lo prepara todavía. Este incremento le da a la cocina su parte del flujo (`recibido → en_preparacion → listo`) y resuelve cómo se enteran todos de los cambios: en vez de que el frontend pregunte una y otra vez (pull), el servidor **empuja** el aviso en el momento en que el estado cambia (push). Así el costo no crece con la cantidad de pantallas abiertas ni con la frecuencia de consulta.

## Alcance

1. Cola de cocina: lista de pedidos pendientes, los más antiguos primero (`operador` y `admin`).
2. Empezar a preparar y marcar como listo, con control de concurrencia.
3. Canal de notificaciones en tiempo real para el **cliente** (cambios de sus propios pedidos) y para la **cocina** (pedidos nuevos y cualquier cambio de estado).
4. El aviso se emite en las transiciones nuevas y también en la creación y la cancelación que ya existen desde el 016.

## Fuera de alcance

- Rondas de despacho, `en_camino`, `entregado`, hora estimada, teléfono del repartidor y WhatsApp (018).
- Encuesta y métricas (019).
- Notificaciones push del sistema operativo o del navegador con la app cerrada, correos y SMS.
- Asignar un pedido a un operador concreto (cualquiera puede tomarlo; solo se registra quién lo hizo).
- Devolver un pedido de `listo` a `en_preparacion` y cancelar un pedido `listo` (no existen).
- Cambiar la forma de crear o cancelar pedidos del 016 (solo se les añade el aviso).

## Vocabulario

- **Cola de cocina**: pedidos en `recibido` o `en_preparacion`, del más antiguo al más nuevo.
- **Canal en tiempo real**: conexión HTTP abierta que el servidor usa para enviar avisos (Server-Sent Events, SSE).
- **Aviso**: mensaje pequeño que dice «el pedido #1042 pasó a `listo`». No lleva datos personales; quien lo recibe consulta el detalle si lo necesita.

## Decisiones de diseño propuestas

Esta sección existe para que las revises junto con el resto de la spec.

1. **SSE en vez de WebSocket.** Los avisos van solo del servidor al navegador, SSE funciona sobre HTTP normal (mismo `Bearer`, mismos guardas, sin librería nueva ni protocolo aparte) y reconecta solo. El navegador no permite enviar el encabezado `Authorization` con `EventSource`, así que el frontend usará `fetch` con lectura en flujo (o una librería equivalente). WebSocket quedaría para un caso bidireccional, que aquí no hay.
2. **Difusión con PostgreSQL `LISTEN/NOTIFY`.** Si hay varias instancias de la API, el aviso debe llegar al cliente conectado a otra instancia. En vez de añadir Redis, cada instancia escucha un canal de PostgreSQL y el aviso se emite con `pg_notify` **dentro de la misma transacción** que cambia el estado: si la transacción se revierte, el aviso nunca sale; si se confirma, sale. No hay infraestructura nueva.
3. **Los avisos son una ayuda, no la fuente de verdad.** El estado vive en la base. Si un aviso se pierde (corte de red, reinicio), el cliente lo recupera consultando `GET /orders` o la cola al reconectar; por eso al abrir el canal el servidor envía un evento `ready` como señal de «vuelve a consultar».
4. **El canal de cocina también recibe los pedidos nuevos.** Es la misma lógica de push: sin él, la cocina tendría que consultar para saber que llegó un pedido.

## Estados

Sin cambios respecto al 016. Este incremento produce `en_preparacion` y `listo`:

`recibido → en_preparacion → listo → (018) en_camino → entregado`, y `cancelado` desde `recibido` o `en_preparacion`.

## Modelo de datos

No hay tablas ni columnas nuevas. Cada transición se guarda en `order_events` (ya existente) con el estado, el usuario que la hizo y la hora; esas horas serán la base del tiempo de preparación en el 019.

## Reglas de negocio

- **RN-64 — Quién opera la cocina.** Solo `operador` y `admin`. `cliente` y `repartidor` reciben `403`; sin sesión `401`. La autorización va antes de cualquier otra validación.
- **RN-65 — Empezar a preparar.** `POST /kitchen/orders/:id/start` solo desde `recibido`; pasa a `en_preparacion`. Cualquier otro estado → `409` indicando el estado actual. Pedido inexistente → `404`.
- **RN-66 — Marcar listo.** `POST /kitchen/orders/:id/ready` solo desde `en_preparacion`; pasa a `listo`. Cualquier otro estado → `409`.
- **RN-67 — Sin marcha atrás.** No existe transición de `listo` a `en_preparacion` ni a `recibido`, y `listo` no se puede cancelar (la regla de cancelación del 016 no cambia).
- **RN-68 — Concurrencia.** Cada transición bloquea la fila del pedido. Si dos personas actúan a la vez sobre el mismo pedido, una gana y la otra recibe `409`; nunca se registra dos veces el mismo evento.
- **RN-69 — Quién y cuándo.** Cada transición agrega un evento con el usuario y la hora. Cualquier operador puede tomar cualquier pedido; no hay asignación.
- **RN-70 — Cola de cocina.** `GET /kitchen/orders` devuelve por defecto los pedidos `recibido` y `en_preparacion`, ordenados por número ascendente (el más antiguo primero), paginados. El filtro opcional `status` acepta uno de los dos estados activos o `listo`; otro valor → `400`. Cada pedido usa la misma vista del 016 (productos, componentes de combos, notas, punto y piso, eventos), sin costos.
- **RN-71 — Cuándo se emite un aviso.** Al crear un pedido, al empezarlo, al marcarlo listo y al cancelarlo (por el cliente, el `operador` o el `admin`). El aviso se emite dentro de la transacción del cambio (decisión 2) y solo cuenta si esta se confirma.
- **RN-72 — Contenido del aviso.** `{ "orderId", "number", "status", "at" }`. Sin nombre, teléfono, tarjeta, productos ni montos.
- **RN-73 — Quién recibe qué.** El canal del cliente entrega únicamente avisos de **sus propios** pedidos. El canal de cocina entrega los avisos de todos los pedidos. Un cliente nunca ve avisos ajenos.
- **RN-74 — Canal del cliente.** `GET /orders/stream`, solo `cliente`. El rol y la pertenencia se validan antes de abrir el canal; `admin`, `operador` y `repartidor` reciben `403`.
- **RN-75 — Canal de cocina.** `GET /kitchen/stream`, solo `operador` y `admin`.
- **RN-76 — Formato del canal.** `Content-Type: text/event-stream`, `Cache-Control: no-store`, `X-Accel-Buffering: no`. Al abrir envía un evento `ready`; por cada cambio, un evento `order` con el aviso; cada 25 segundos, un comentario de latido para mantener la conexión viva a través de proxies.
- **RN-77 — Sesión vigente.** En cada latido el servidor comprueba que la sesión siga vigente; si fue revocada (cierre de sesión, cambio de contraseña) o venció, cierra el canal.
- **RN-78 — Límites.** Un mismo usuario puede tener como máximo 5 canales abiertos a la vez; el sexto recibe `429`. Abrir canales está limitado a 30 por minuto por IP (`429`). Al cerrar el cliente la conexión, el servidor libera todo lo asociado (sin fugas de suscripciones).
- **RN-79 — Sin retroceso de datos.** Un fallo en la difusión (por ejemplo, la conexión de escucha se cae) nunca deshace ni retrasa el cambio de estado: la escucha se reconecta sola con espera creciente y el estado ya está guardado.
- **RN-80 — Errores.** Orden: `401 → 403 → 400 → 404 → 409`; el límite de peticiones y de canales es `429`.

## Contratos

### `GET /kitchen/orders?page=&limit=&status=` (operador, admin)

`200` con `{ data, page, limit, total, totalPages }`; cada elemento es la vista de pedido del 016.

### `POST /kitchen/orders/:id/start` y `POST /kitchen/orders/:id/ready` (operador, admin)

Sin cuerpo. `200` con la vista del pedido ya actualizada (con el nuevo evento en `events`).

### `GET /orders/stream` (cliente) y `GET /kitchen/stream` (operador, admin)

`200` con `text/event-stream`. Ejemplo:

```
event: ready
data: {}

event: order
data: {"orderId":"uuid","number":1042,"status":"en_preparacion","at":"2026-11-05T17:03:11.000Z"}

: keep-alive
```

El frontend, al recibir `ready` (incluida cada reconexión), vuelve a consultar sus pedidos o la cola, y a partir de ahí aplica los avisos `order` que lleguen.

Operaciones nuevas (5): `GET /kitchen/orders`, `POST /kitchen/orders/:id/start`, `POST /kitchen/orders/:id/ready`, `GET /orders/stream`, `GET /kitchen/stream`. Total: 43.

## Decisiones confirmadas por el usuario

1. La cocina la operan `operador` y `admin`.
2. Sin marcha atrás de `listo`.
3. Un pedido `listo` no se cancela.
4. Notificaciones por **push** (el servidor avisa al cliente al cambiar el estado), no por consulta repetida.
5. Cualquier operador puede tomar cualquier pedido; se registra quién lo hizo.

## Criterios de aceptación

| ID    | Escenario                                                                                      | Resultado                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CA-01 | Operador y admin empiezan y terminan un pedido                                                 | `recibido → en_preparacion → listo`, `200` con la vista actualizada y un evento nuevo por transición con usuario y hora       |
| CA-02 | `cliente` y `repartidor` en las rutas de cocina; sin sesión                                    | `403` y `401`, sin cambios                                                                                                    |
| CA-03 | Empezar un pedido que no está `recibido`; marcar listo uno que no está `en_preparacion`        | `409` con el estado actual; sin eventos nuevos                                                                                |
| CA-04 | Pedido inexistente o `id` mal formado                                                          | `404` / `400`                                                                                                                 |
| CA-05 | Pedido `cancelado` o `listo` en `start`, `ready` o cancelación                                 | `409`; el saldo y el estado no cambian                                                                                        |
| CA-06 | Dos operadores empiezan el mismo pedido a la vez (y lo marcan listo a la vez)                  | Uno recibe `200` y el otro `409`; un solo evento por transición                                                               |
| CA-07 | Cola de cocina                                                                                 | Por defecto solo `recibido` y `en_preparacion`, el número menor primero, paginada y sin costos; `status=listo` muestra listos |
| CA-08 | `status` inválido en la cola                                                                   | `400`                                                                                                                         |
| CA-09 | El cliente abre su canal y su pedido cambia de estado                                          | Recibe `ready` al abrir y un evento `order` con número, estado y hora, sin datos personales                                   |
| CA-10 | Dos clientes con canal abierto; cambia el pedido de uno                                        | Solo ese cliente recibe el aviso                                                                                              |
| CA-11 | Canal de cocina abierto; llega un pedido nuevo, cambia de estado o se cancela                  | La cocina recibe un aviso por cada uno de esos hechos                                                                         |
| CA-12 | El cambio de estado se revierte (la transacción falla)                                         | No se emite ningún aviso                                                                                                      |
| CA-13 | Dos instancias de la API conectadas a la misma base                                            | Un cambio hecho en una instancia llega al canal abierto en la otra                                                            |
| CA-14 | Roles equivocados en los canales (`admin` o `operador` en el del cliente, `cliente` en cocina) | `403`                                                                                                                         |
| CA-15 | Sesión revocada con el canal abierto                                                           | El canal se cierra en el siguiente latido                                                                                     |
| CA-16 | Sexto canal simultáneo del mismo usuario; más de 30 aperturas por minuto desde una IP          | `429`                                                                                                                         |
| CA-17 | El cliente cierra la conexión                                                                  | El servidor libera la suscripción (sin crecimiento de suscripciones tras abrir y cerrar muchas veces)                         |
| CA-18 | Se cae la conexión de escucha de PostgreSQL                                                    | La API reconecta sola, los estados ya guardados no se pierden y los avisos vuelven a llegar                                   |
| CA-19 | Cabeceras                                                                                      | `Cache-Control: no-store` en todas las rutas nuevas; los canales con `text/event-stream`                                      |
| CA-20 | Swagger JSON                                                                                   | Exactamente 43 operaciones; los canales documentados como `text/event-stream`                                                 |
| CA-21 | Cobertura global                                                                               | ≥ 80 % en líneas, sentencias, funciones y ramas                                                                               |

## Trazabilidad (prevista)

| Criterio                            | Prueba                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| CA-01 a CA-05, CA-07, CA-08         | `test/database/kitchen.e2e-spec.ts`                                                    |
| CA-06                               | `test/database/kitchen-concurrency.e2e-spec.ts`                                        |
| CA-09 a CA-12, CA-14 a CA-17, CA-19 | `test/database/order-streams.e2e-spec.ts`                                              |
| CA-13, CA-18                        | `test/database/order-notifications.e2e-spec.ts` (dos aplicaciones sobre la misma base) |
| CA-20                               | `test/swagger.e2e-spec.ts`                                                             |
| Funciones puras                     | `test/unit/order-notifications.spec.ts` (formato del aviso, filtro por destinatario)   |
| CA-21                               | `npm run test:cov`                                                                     |
