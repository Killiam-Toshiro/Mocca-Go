# Plan 018 — Rondas de despacho y entrega

Fecha: 2026-11-05. Spec aprobada el mismo día.

## Enfoque

Una migración (`1791244808000-dispatch`) y un módulo nuevo, `src/dispatch/`, que reutiliza el servicio de avisos del 017 (el módulo `orders` lo exporta).

1. **Migración**: tabla `dispatch_rounds`; `orders.round_id` y `orders.failure_reason`; el CHECK de estados de `orders` y de `order_events` suma `no_entregado`; CHECK de consistencia entre estado, ronda y motivo; `users.phone` y `users.full_name`.
2. **Personal con contacto**: `UsersService` guarda y devuelve `phone` y `fullName` del personal; el rol `repartidor` los exige al crearlo y al asignarle el rol. El seed da valores de ejemplo al repartidor de demostración (también si ya existe sin ellos).
3. **`DispatchService`**:
   - `queue`: pedidos `listo`, agrupados por zona con funciones puras (`dispatch.calc.ts`).
   - `createRound`: en una transacción bloquea la fila del repartidor (así el límite de 2 rondas no se burla con peticiones simultáneas), elige los pedidos (sugerencia con `FOR UPDATE SKIP LOCKED`, o ruta propia bloqueando por id), inserta la ronda, pasa los pedidos a `en_camino`, registra los eventos y emite los avisos.
   - `deliver` / `fail`: bloquean primero el pedido y después la ronda (orden fijo para evitar interbloqueos), cambian el estado y cierran la ronda si ya no queda ningún pedido `en_camino`.
   - `list` / `findOne` de rondas, con la visibilidad por rol.
4. **Vista del pedido**: `delivery.courier` (nombre, teléfono y enlace de WhatsApp) y `delivery.etaAt` solo mientras el pedido está `en_camino`; `failureReason` en `no_entregado`.
5. **Canal del repartidor** (`GET /dispatch/stream`): nuevo ámbito `dispatch` en el servicio de avisos, que recibe todos los avisos como la cocina.
6. Corrección del 017: eliminar a un usuario con eventos de pedidos o rondas daba `500`; ahora responde `409`.

## Piezas

| Archivo                                                   | Contenido                                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/database/migrations/1791244808000-dispatch.ts`       | Migración (con `down()` que aborta si hay rondas o personal con datos de contacto).       |
| `src/dispatch/entities/dispatch-round.entity.ts`          | Entidad de la ronda (con repartidor).                                                     |
| `src/dispatch/dispatch.calc.ts`                           | Puro: constantes (5 pedidos, 2 rondas, 15 min), agrupar por zona, enlace de WhatsApp.     |
| `src/dispatch/dispatch.dto.ts`                            | `CreateRoundDto`, `FailOrderDto`, `ListRoundsDto`.                                        |
| `src/dispatch/dispatch.service.ts`                        | Cola, rondas, entrega y consultas.                                                        |
| `src/dispatch/dispatch.view.ts` / `dispatch.responses.ts` | Vistas y esquemas Swagger.                                                                |
| `src/dispatch/dispatch.controller.ts`                     | Las siete rutas de `/dispatch`.                                                           |
| `src/orders/*`                                            | `round`/`failureReason` en la entidad y la vista, estado `no_entregado`, exportar avisos. |
| `src/orders/notifications/*`                              | Ámbito `dispatch` del canal.                                                              |
| `src/users/*`                                             | `phone` y `fullName` del personal.                                                        |
| `src/seed/seed.ts`                                        | Datos de contacto del repartidor de demostración.                                         |

## Decisiones técnicas

- **Crear la ronda es salir** (sin estado intermedio), todo en una transacción.
- **Sugerencia sin choques:** primero se toma el pedido más antiguo no bloqueado por otro repartidor y luego hasta 5 de su zona, ambas veces con `FOR UPDATE SKIP LOCKED`. Dos repartidores simultáneos reciben grupos disjuntos.
- **Orden de bloqueos fijo:** repartidor → pedidos (por id) → ronda nueva; y al entregar, pedido → ronda. No hay ciclos.
- **Zona de un pedido:** la del punto de entrega en el momento de armar la ronda; la ronda guarda una copia del nombre.
- **Teléfono del personal** con el mismo normalizador y el mismo CHECK E.164 que los clientes.
- **Estados con CHECK** (como en el 016); el estado final `no_entregado` no toca inventario ni pago.

## Riesgos

| Riesgo                                                 | Mitigación                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Dos repartidores toman el mismo pedido                 | Bloqueo de filas con `SKIP LOCKED` (sugerencia) y bloqueo ordenado por id (ruta propia). |
| Más de 2 rondas activas por peticiones simultáneas     | Bloqueo de la fila del repartidor antes de contar.                                       |
| Ronda que no se cierra si dos entregas llegan a la vez | Las entregas bloquean la ronda antes de contar los pedidos pendientes.                   |
| Repartidores ya existentes sin teléfono                | `409` claro al crear una ronda; el admin los completa con `PATCH /users/:id`.            |
| Datos de contacto del repartidor expuestos             | Solo se muestran al cliente mientras su pedido está `en_camino`.                         |
