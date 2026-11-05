# Plan 016 — Pedidos con pago de demostración

Fecha: 2026-11-05. Una migración, módulo `orders` y un refactor pequeño de `movements` para reutilizar el descuento de saldo dentro de otra transacción. Sin dependencias ni variables de entorno nuevas.

## Decisiones (registradas en `docs/decisions.md`)

- D-92: el inventario sigue teniendo una sola fuente de verdad, el historial de movimientos. El pedido no calcula saldos por su cuenta: llama al núcleo de `MovementsService` dentro de su transacción.
- D-93: el saldo baja al aprobarse el pago, dentro de la misma transacción que crea el pedido; cancelar lo devuelve con movimientos `IN`.
- D-94: los pagos son simulados con dos tarjetas de prueba; el número completo se valida en memoria y nunca se persiste ni se registra. Un rechazo es `402` y no deja rastro.
- D-95: `Idempotency-Key` obligatorio y huella del contenido (SHA-256 de una forma canónica) guardada con el pedido; la unicidad `(customer_id, idempotency_key)` la decide PostgreSQL.
- D-96: el pedido guarda copias (nombres, precios, costos, punto y zona, componentes de combos) para que el historial no cambie cuando cambie el menú.
- D-97: los estados se modelan como CHECK y una tabla de eventos (`order_events`); 017 y 018 solo agregan transiciones.
- D-98: el costo de las líneas es dato interno: se guarda pero no se devuelve en ninguna respuesta de pedidos.

## Migración `1791244807000-orders`

- Secuencia `orders_number_seq` desde 1001.
- Tablas `orders`, `order_items`, `order_item_components`, `order_events`, con CHECK de estado, total (1 a 200.000), cantidades (1 a 10), piso (1 a 30), método y estado de pago; único `(customer_id, idempotency_key)`; índices por cliente y fecha, por estado y fecha y por `order_id` en las tablas hijas.
- `stock_movements.order_id` (nullable, FK `RESTRICT`, índice).
- `down()`: aborta si existe algún pedido; si no, elimina la columna, las tablas y la secuencia.

## Código

- `src/orders/entities/`: `order`, `order-item`, `order-item-component`, `order-event`.
- `src/orders/orders.calc.ts` (puro): expansión de líneas a productos simples agrupados y ordenados por id, total, huella canónica y comprobaciones de tarjeta de prueba.
- `src/orders/orders.dto.ts`: `CreateOrderDto` (líneas anidadas, `payment`), `CancelOrderDto`, `ListOrdersDto`.
- `src/orders/orders.service.ts`: crear, listar, consultar y cancelar.
  - **Crear**: validar `Idempotency-Key` y tarjeta → buscar pedido previo del cliente con la clave (misma huella → devolverlo; otra huella → `409`) → transacción: leer productos y componentes, calcular disponibilidad y total, validar punto/zona/piso, aplicar movimientos `OUT` en orden de id, insertar pedido, líneas, componentes y evento. Una violación del único de idempotencia (carrera) se resuelve releyendo el pedido ganador.
  - **Cancelar**: bloquear el pedido, comprobar rol y estado, leer sus movimientos `OUT`, aplicar los `IN` en orden de id, marcar `cancelado`/`reembolsado` y registrar el evento.
- `src/orders/orders.view.ts` y `orders.responses.ts` (Swagger); sin costos.
- `src/orders/orders.controller.ts`: guards `AuthGuard` + `RolesGuard`, `@Roles('cliente')` para crear, `@Roles('cliente','admin','operador')` para el resto (el servicio filtra por dueño), `ThrottlerGuard` con 10/min en `POST`.
- `MovementsService`: se extrae `applyMovement(manager, {productId, userId, type, quantity, reason, orderId?})` con el bloqueo, las comprobaciones (combo, inactivo, saldo) y la inserción; `create` la usa tras revalidar la sesión y su contrato HTTP no cambia. El pedido la usa con `orderId`. Una inactividad sobrevenida de un producto no impide devolver saldo al cancelar (el `IN` de cancelación salta la comprobación de «activo»).
- `movement.view` y respuestas: campo `orderId` (nullable).
- `common/openapi.ts`: soporte del código `402`.
- `configure-app.ts`: `no-store` en `/api/v1/orders`.

## Pruebas

- Nuevas: `order-calculations` (unitaria), `orders-migration`, `orders`, `orders-read-cancel`, `orders-concurrency`.
- Existentes que cambian: movimientos (campo `orderId`), persistencia (8 migraciones), autenticación J-07 (6 migraciones a deshacer), roles (rutas de `/orders`) y Swagger (38 operaciones).
- Postman: carpeta 07f (compra con tarjeta aprobada, rechazada, idempotencia, cancelación y permisos).

## Riesgos

- Interbloqueos entre pedidos con productos en común: se evitan bloqueando siempre por id ascendente.
- Doble envío: cubierto por idempotencia y por el único de PostgreSQL.
- Datos de tarjeta: solo se aceptan dos números de prueba; el cuerpo se descarta tras validar y los logs de la API no imprimen el cuerpo de la petición (se comprueba con una prueba).
