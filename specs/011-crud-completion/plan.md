# Plan 011 — CRUD de productos/usuarios y readiness

Fecha: 2026-10-12. Sin migraciones ni dependencias nuevas. Contrastado con el código de `feat/update-methods`.

## Decisiones propuestas (registrar en `docs/decisions.md`)

- D-59: eliminación física de productos y usuarios solo sin movimientos; con historial `409`. Reemplaza el «fuera de alcance» de 006.
- D-60: en `DELETE /users/:id` se evalúa primero «último admin» y después «auto-eliminación», para que ambas reglas sean alcanzables. Las sesiones se eliminan por la FK `ON DELETE CASCADE` existente.
- D-61: un admin puede cambiar `username` y `password` de cualquier usuario; cambiar la contraseña revoca las demás sesiones del destino y reinicia su bloqueo. Reemplaza parcialmente el «fuera de alcance» de 007.
- D-62: `MovementsService` traduce la violación de `stock_movements_user_id_fkey` a `401`, para que un borrado de usuario concurrente no produzca `500`.
- D-63: `GET /health/ready` con `SELECT 1` y límite de 2 s; `503` genérico. Railway y el smoke test siguen usando `GET /health`.
- D-64: Swagger pasa a 19 operaciones y `ErrorStatus` admite `503`.

## Productos — `DELETE /products/:id`

- `src/products/controller/products.controller.ts`: `@Delete(':id') @HttpCode(204) @Roles('admin')`, con el decorador `PRODUCT_ID` y `@Param('id', new ParseUUIDPipe({ version: '4' }))` como las demás rutas. Swagger: `@ApiNoContentResponse()` y `@ApiErrors(400, 403, NOT_FOUND, [409, '…'])`; el `401` ya está a nivel de clase.
- `src/products/services/products.services.ts` → `remove(id)` en `this.source.transaction`:
  1. Bloquear la fila con `createQueryBuilder('product').where(...).setLock('pessimistic_write').getOne()`, igual que `changeCatalogFields` → si no existe, `NotFoundException('Producto no encontrado.')`.
  2. `manager.getRepository(StockMovement).existsBy({ productId: id })` → si hay, `ConflictException`.
  3. `repository.delete({ id })`.
  4. Fuera de la transacción, capturar `QueryFailedError` con código `23503` y restricción `stock_movements_product_id_fkey` → `ConflictException` (red de seguridad). Cualquier otro error se propaga, como en `isDuplicateSku`.
- `MovementsService.create` ya bloquea la fila del producto y responde `404` si no la encuentra tras esperar; no requiere cambios para CA-05.

## Usuarios — `GET`, `PATCH`, `DELETE /users/:id`

- `src/users/users.dto.ts`: `UpdateUserDto` con `username?` y `password?`. Seguir el patrón de `UpdateProductDto`: `@ValidateIf((_object, value) => value !== undefined)` (así `null` se rechaza) más las validaciones de `CreateUserDto` (`@Matches(USERNAME_PATTERN)`, `@Length(12, 128)`), con `@ApiPropertyOptional`. El pipe global ya rechaza campos extra.
- Body vacío: `BadRequestException('Indica al menos un campo para editar.')` en el servicio, antes de abrir la transacción (igual que `ProductsService.update`). No se crea un validador de clase.
- Crear la constante `USER_NOT_FOUND = 'Usuario no encontrado.'` (hoy es un literal en `users.service.ts` y otro en el controlador) y usarla en `changeRole`, en las tres rutas nuevas y en `@ApiErrors`. Reutilizar `userView()`.
- `src/users/users.controller.ts`: las tres rutas heredan `@Roles('admin')` y los guards de la clase. `@Patch(':id')` y `@Patch(':id/role')` no chocan. `@Delete(':id')` con `@HttpCode(204)`.
- `src/users/users.service.ts` (`adminTransaction(actor, 'read' | 'write', operation)` ya toma el bloqueo asesor y revalida sesión y rol del actor; no hay que repetirlo):
  - `findOne(actor, id)`: `adminTransaction(actor, 'read', …)` → `findOneBy({ id })` → `404` o `userView`.
  - `update(actor, id, dto)`:
    1. `400` si no llega ningún campo.
    2. Si llega `password`, `hashPassword` (de `src/seed/password.ts`) **antes** de abrir la transacción, como hace `create()`.
    3. `adminTransaction(actor, 'write', …)` → bloquear el destino con `setLock('pessimistic_write')` → `404`.
    4. Calcular cambios: `username` solo si es distinto; con `password`: `passwordHash`, `loginFailures: 0`, `blockedUntil: null`.
    5. Con `password`: `UPDATE sessions SET revoked_at = now()` para las sesiones del destino con `revoked_at IS NULL` e `id <> actor.sessionId`.
    6. `repository.update` solo si hay cambios (así `updatedAt` no se mueve) y devolver `userView`.
    7. Fuera de la transacción, traducir la violación de `users_username_key` a `ConflictException('El username ya existe.')`. Extraer de `create()` un helper `isDuplicateUsername(error)` y usarlo en ambos; no se hace comprobación previa.
  - `remove(actor, id)`: `adminTransaction(actor, 'write', …)` → bloquear el destino → `404` → si es admin y es el último, `409` → si `id === actor.id`, `409` → si tiene movimientos (`existsBy({ userId: id })`), `409` → `repository.delete({ id })`. Las sesiones caen por CASCADE. Fuera de la transacción, `23503` con `stock_movements_user_id_fkey` → el mismo `409` de movimientos.
  - Extraer de `changeRole` un helper privado `isLastAdmin(manager)` (`countBy({ role: 'admin' }) <= 1`) y usarlo en `changeRole` y `remove`.

## Movimientos — carrera con el borrado de usuario

- `src/movements/movements.service.ts`: en el `catch` de `create`, antes del `500` genérico, si el error es `23503` con restricción `stock_movements_user_id_fkey` → `UnauthorizedException('Credenciales inválidas.')`. El resto de `QueryFailedError` conserva el `500` actual.

## Health — `GET /health/ready`

- `src/health/health.controller.ts`: inyectar `DataSource` (TypeORM lo expone globalmente; `HealthModule` no cambia). `@Get('ready')` ejecuta `SELECT 1` con `Promise.race` contra un temporizador de 2 s que se limpia con `clearTimeout` al terminar. Éxito → `{ status: 'ok' }` (reutiliza `HealthResponse`); fallo → `ServiceUnavailableException('Base de datos no disponible.')`.
- No hay guard global de autenticación ni de throttling, así que no hay nada que excluir: basta con no añadir guards.
- `src/configure-app.ts`: añadir `'/api/v1/health/ready'` a la lista del middleware de `Cache-Control: no-store`. Un `@Header` no se aplica cuando se lanza la excepción del `503`.
- `src/common/openapi.ts`: añadir `503` a `ErrorStatus` y a `DEFAULT_ERRORS`.

## Pruebas (Jest + Supertest + PostgreSQL real)

Jest recoge `test/unit/**/*.spec.ts` y `test/**/*.e2e-spec.ts`; no existe `test/http/`.

- `test/database/products-delete.e2e-spec.ts`: CA-01 a CA-05, incluido borrado vs. movimiento concurrente.
- `test/database/users-crud.e2e-spec.ts`: CA-06 a CA-14 y CA-18. Para la eliminación cruzada, observar la espera con `pg_locks` como en `users.e2e-spec.ts`. Para CA-18, forzar la violación de la FK de forma determinista (movimiento en espera del bloqueo del producto mientras se confirma el borrado del usuario).
- `test/database/health-ready.e2e-spec.ts`: CA-15. Para el `503`, `jest.spyOn(app.get(DataSource), 'query')` con un rechazo y con una promesa que no resuelve (temporizadores falsos); no se apaga PostgreSQL.
- `test/unit/users-contract.spec.ts`: casos de `UpdateUserDto` (null, extra, límites, tipos).
- `test/swagger.e2e-spec.ts`: actualizar `PUBLIC`, `ADMIN_ONLY`, `SUCCESS` y el total a **19**; añadir `404`/`409` de las rutas nuevas y el `503` de readiness (CA-16).
- `test/unit/movements-contract.spec.ts` o la suite e2e de movimientos: la traducción `23503` → `401`.

## Colección Postman

- `postman/` está sin versionar en esta rama: se añade al repositorio en este incremento.
- Carpeta 07 deja de ser «pendiente»: renombrar y quitar el prefijo `[PENDIENTE]` (también de las dos peticiones de Swagger, que ya pasan).
- **Cambio necesario**: la carpeta 09 hace `logout` con `qaToken` después de que la 07 elimina al usuario QA, así que obtendría `401` en lugar de `204`. Usar un usuario desechable `qa_del_*` para el borrado en la 07 (ver tasks).
- Opcional: `PATCH /users/:id` duplicado → 409, body vacío → 400, cambio de contraseña → login viejo 401.

## Riesgos

- Borrado físico pierde la fecha de creación del registro: aceptable porque solo se borran entidades sin historial.
- Un admin que cambia su contraseña conserva la sesión actual por diseño (CA-11).
- `package-lock.json` tiene cambios locales ajenos a este incremento (marcas `peer`); no se incluyen en el commit.
