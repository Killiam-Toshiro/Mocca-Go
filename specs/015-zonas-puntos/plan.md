# Plan 015 — Zonas y puntos de entrega

Fecha: 2026-11-05. Una migración, dos entidades nuevas, un módulo `delivery` y cambios en el seed. Sin variables de entorno ni dependencias nuevas.

## Decisiones (registradas en `docs/decisions.md`)

- D-86: zonas y puntos son dos tablas (`delivery_zones`, `delivery_points`). La zona es solo de despacho y el cliente nunca la elige; se deduce del punto, que es lo que elegirá en el pedido (016).
- D-87: `floors` es un entero de 1 a 30 o `NULL` («sin pisos»); `hint` es texto opcional de hasta 200 caracteres. La validación del piso elegido en un pedido es de 016.
- D-88: la consulta pública (`GET /delivery-zones`) y la de administración (`GET /delivery-zones/all`) son rutas separadas, para no mezclar autorización opcional en una sola. La pública es `no-store` y limitada a 60 peticiones por minuto por IP, como el menú.
- D-89: los nombres son únicos sin distinguir mayúsculas mediante índices únicos sobre `lower(name)`. La unicidad la decide PostgreSQL y el servicio la traduce a `409`.
- D-90: las carreras entre crear un punto y eliminar su zona se resuelven con el bloqueo compartido de la fila de la zona al crear o mover un punto, el bloqueo exclusivo al eliminarla y la FK `RESTRICT` como red de seguridad.
- D-91: el teléfono del personal y el aviso «en camino» se difieren a 016/017; este incremento no toca `users`.

## Migración `1791244806000-delivery-zones-points`

- `up()`: crea `delivery_zones` (`id`, `name varchar(60)`, `active`, fechas; CHECK de nombre con carácter visible; índice único `delivery_zones_name_key` sobre `lower(name)`) y `delivery_points` (`id`, `zone_id` FK `RESTRICT`, `name varchar(80)`, `hint varchar(200)`, `floors smallint`, `active`, fechas; CHECK de nombre visible, de `hint` no vacío y de `floors` entre 1 y 30; índice único `delivery_points_name_key` sobre `lower(name)`; índice en `zone_id`).
- `down()`: aborta sin cambios si existe alguna fila en cualquiera de las dos tablas; si no, elimina ambas.

## Código

- `src/delivery/entities/delivery-zone.entity.ts` y `delivery-point.entity.ts`; registro en `data-source.ts`.
- `src/delivery/delivery.dto.ts`: `CreateZoneDto`, `UpdateZoneDto`, `CreatePointDto`, `UpdatePointDto`, con la misma política que productos (`ValidateIf` en vez de `IsOptional` para impedir `null` donde no corresponde; `hint` y `floors` sí admiten `null` en la edición).
- `src/delivery/delivery.service.ts`: creación, edición, eliminación y listados. Edición en transacción con bloqueo de fila y `UPDATE` solo de las columnas que cambian (repetir valores no toca `updatedAt`). Listados con una consulta para zonas y otra para puntos en una transacción `REPEATABLE READ`.
- `src/delivery/delivery.views.ts` (vistas pública y de administración) y `delivery.responses.ts` (Swagger).
- `src/delivery/controllers/`: `DeliveryZonesController` (`GET` público con `ThrottlerGuard`, `GET all` y escrituras con `@Roles('admin')`) y `DeliveryPointsController` (solo admin).
- `src/common/database-errors.ts`: constantes de los índices únicos y de las FK.
- `configure-app.ts`: `no-store` en `/delivery-zones` y `/delivery-points`.
- Seed: 4 zonas y 17 puntos; idempotente por nombre sin distinguir mayúsculas.

## Pruebas

- Nuevas: `delivery-migration`, `delivery` (administración y concurrencia) y `delivery-public` (consulta pública, claves, `no-store` y `429`), más un arnés compartido ampliado si hace falta.
- Existentes que cambian: `seed.e2e-spec` (conteos y nuevos datos), `persistence.e2e-spec` (7 migraciones), `auth.e2e-spec` J-07 (deshacer 5 migraciones) y `swagger.e2e-spec` (34 operaciones).
- Postman: carpeta nueva 07e (consulta pública, administración, `409`, `403`) en las dos colecciones.

## Riesgos

- La consulta pública sin sesión es de solo lectura y acotada (pocas decenas de filas); el limitador por IP la protege.
- Eliminar un punto hoy no tiene referencias; en 016 la FK del pedido pasará a responder `409`. Está previsto en RN-44.
