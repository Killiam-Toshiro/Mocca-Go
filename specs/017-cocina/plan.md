# Plan 017 — Órdenes de cocina y notificaciones en tiempo real

Fecha: 2026-11-05. Spec aprobada el mismo día.

## Enfoque

Sin migración: el 016 ya dejó los estados, la tabla `order_events` y los índices. El incremento agrega tres piezas dentro del módulo `orders`:

1. **`KitchenService` / `KitchenController`** (`/kitchen/...`): cola y transiciones `start` y `ready`. Cada transición bloquea la fila del pedido (`pessimistic_write`), verifica el estado de origen, actualiza, registra el evento y emite el aviso, todo en una transacción.
2. **`OrderNotificationsService`**: único punto de entrada y salida de avisos.
   - **Publicar**: `SELECT pg_notify('order_events', payload)` con el `EntityManager` de la transacción del cambio. PostgreSQL entrega el aviso solo si la transacción se confirma.
   - **Escuchar**: una conexión propia (creada con la configuración del pool de TypeORM, pero fuera de él) ejecuta `LISTEN order_events`. Si se cae, reconecta con espera creciente (0,5 s, 1 s, 2 s… hasta 30 s) y avisa a los canales abiertos con un nuevo `ready` para que los clientes vuelvan a consultar.
   - **Servir canales SSE**: escribe directamente en la respuesta HTTP (para poder enviar comentarios de latido), con límite por usuario, latido con verificación de sesión y limpieza al cerrar la conexión.
3. Las operaciones `create` y `cancel` del 016 publican el aviso dentro de su transacción.

El aviso viaja siempre por PostgreSQL, incluso hacia las conexiones de la misma instancia, para que haya un solo camino y el comportamiento sea idéntico con una o con varias instancias.

## Piezas

| Archivo                                                   | Contenido                                                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/orders/notifications/order-notice.ts`                | Puro: codificar y decodificar el aviso, destinatarios, formato de cuadros SSE.                                    |
| `src/orders/notifications/order-notifications.service.ts` | Publicación, escucha con reconexión, canales SSE, límites y cierre ordenado.                                      |
| `src/orders/kitchen.service.ts`                           | Cola y transiciones.                                                                                              |
| `src/orders/kitchen.controller.ts`                        | `GET /kitchen/orders`, `POST /kitchen/orders/:id/start`, `POST /kitchen/orders/:id/ready`, `GET /kitchen/stream`. |
| `src/orders/orders.controller.ts`                         | Agrega `GET /orders/stream` (antes de `GET /orders/:id`).                                                         |
| `src/orders/orders.service.ts`                            | Publica el aviso al crear y al cancelar.                                                                          |
| `src/orders/orders.dto.ts`                                | `ListKitchenDto` (paginación y `status`).                                                                         |
| `src/auth/auth.service.ts`                                | `isSessionActive(identity)` para el latido.                                                                       |
| `src/configure-app.ts`                                    | `no-store` también en `/api/v1/kitchen`.                                                                          |

## Decisiones técnicas

- **Sin dependencias nuevas.** `pg` ya está instalado; la conexión de escucha se crea aparte del pool (con su misma configuración), para que `DataSource.destroy()` nunca quede esperándola.
- **Parámetros de los canales inyectables** (`STREAM_OPTIONS`: latido de 25 s y 5 canales por usuario) para poder probar el latido y el límite sin esperar.
- **Cierre ordenado.** Al apagar la aplicación se cierran los canales abiertos antes de cerrar el servidor HTTP; de lo contrario el cierre quedaría esperando conexiones que nunca terminan.
- **Aviso mínimo.** Va por `pg_notify` (límite de 8000 bytes) con `{c, o, n, s, t}`; el destinatario se decide al recibirlo y el `customerId` nunca se envía al navegador.
- **Orden de rutas.** `GET /orders/stream` se declara antes de `GET /orders/:id` para que no lo capture el parámetro.
- **Throttler.** `ThrottlerGuard` con 30 aperturas por minuto por IP en ambos canales.

## Riesgos

| Riesgo                                                      | Mitigación                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Aviso perdido por reinicio o corte                          | `ready` al abrir y tras cada reconexión de la escucha; la base es la fuente de verdad. |
| Conexión de escucha adicional                               | Una por instancia, fuera del pool; se documenta en el README.                          |
| Conexiones abiertas impiden apagar la API                   | Cierre de canales en `onModuleDestroy`.                                                |
| Aviso emitido para un cambio que se revierte                | `pg_notify` dentro de la transacción: PostgreSQL lo descarta si hay rollback.          |
| Pruebas con esquemas aislados comparten el canal de la base | Las suites corren en serie y cada aplicación filtra por los pedidos que conoce.        |
