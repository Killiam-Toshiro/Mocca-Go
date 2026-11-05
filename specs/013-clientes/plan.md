# Plan 013 — Clientes

Fecha: 2026-11-05. Una migración, un módulo nuevo (`customers`), un cambio de contrato en el login y una ruta nueva de autenticación. Sin variables de entorno ni dependencias nuevas.

## Decisiones (registradas en `docs/decisions.md`)

- D-73: el cliente es un `users` con rol `cliente` más una fila 1 a 1 en `customers` (correo, nombre, teléfono). Login, sesiones, bloqueo por intentos y guards se reutilizan. El `username` del cliente es interno y generado.
- D-74: registro público `POST /customers` con límite de 5 por minuto por IP; no inicia sesión. El `409` por correo duplicado revela que el correo existe (aceptado en la demo).
- D-75: `POST /auth/login` acepta `email` (clientes) o `username` (personal), exactamente uno. Correo normalizado a minúsculas; todos los fallos son `401` idéntico.
- D-76: el teléfono se guarda en E.164 (`+573001234567`), obligatorio y no único; acepta celulares colombianos e internacionales. El envío de WhatsApp o SMS queda para un incremento posterior.
- D-77: `PATCH /auth/password` permite a cualquier rol cambiar su propia contraseña. Verifica la actual con el contador de fallos del login (5 fallos → bloqueo de 15 min), exige una nueva distinta y revoca las demás sesiones. Una contraseña actual incorrecta responde `403` (no `401`) para no confundirla con una sesión vencida. Complementa D-61 (el admin sigue restableciendo contraseñas ajenas).
- D-78: no se pide verificar correo ni teléfono; el origen de adquisición queda fuera.

## Migración `1791244804000-customers`

- `up()`: crea `customers` (`user_id uuid PK` con FK a `users(id) ON DELETE CASCADE`, `email varchar(254)` con restricción única `customers_email_key` y CHECK `customers_email_lower` (`email = lower(email)`), `full_name varchar(100)` con CHECK de longitud mínima 2 tras `btrim`, `phone varchar(16)` con CHECK E.164, `created_at`, `updated_at` con `now()`).
- `down()`: aborta sin cambios si existe alguna fila; si no, elimina la tabla.

## Código

- `src/customers/phone.ts`: `normalizePhone(input): string | null` (RN-19), pura y con pruebas unitarias.
- `src/customers/entities/customer.entity.ts`: entidad registrada en `data-source.ts`.
- `src/customers/customers.dto.ts`: `RegisterCustomerDto` y `UpdateCustomerDto` (correo y nombre recortados, correo en minúsculas, teléfono normalizado con `@Transform`; un teléfono no interpretable se transforma en `null` y falla la validación).
- `src/customers/customers.service.ts`: `register` (hash fuera de la transacción; `users` y `customers` con `manager.insert` en una transacción; `409` si falla `customers_email_key`), `profile`, `updateProfile`.
- `src/customers/customers.controller.ts`: `POST /customers` (público, `ThrottlerGuard` con `@Throttle` de 5/min), `GET` y `PATCH /customers/me` (`AuthGuard`, `RolesGuard`, `@Roles('cliente')`).
- `src/auth`: `LoginDto` con `username` o `email`; `AuthService.login` busca por correo vía `customers` y reutiliza el bloqueo de la fila; `AuthService.changePassword` y `ChangePasswordDto`; `AuthModule` exporta `ThrottlerModule`.
- `configure-app.ts`: `/api/v1/customers` con `Cache-Control: no-store`.
- Swagger pasa de 19 a 23 operaciones.

## Pruebas

Las de la tabla de trazabilidad de la spec. Cada prueba de integración crea una aplicación y una base nuevas, así que el límite de 5 registros por minuto no interfiere con las demás.

## Riesgos

- El límite en memoria es por instancia (D-23); se mantiene una réplica (D-58).
- `down()` de esta migración y la de 012 aborta con datos reales; se revierte solo en bases descartables.
