# Especificación 011 — Completar CRUD de productos y usuarios, y readiness

Fecha: implementación 2026-10-12; auditoría 2026-10-13. Estado: implementado/publicado en main `635e928`; CI y despliegue exitosos en run 38324403873. Contratos contrastados antes del código y decisiones D-59 a D-64 registradas. La auditoría repite las verificaciones actuales sin modificar implementación.

## Contexto

Antes de este incremento, la carpeta **07 PENDIENTES** definía cinco rutas inexistentes y fallaban 12 aserciones en 11 peticiones. En main ya están implementadas y la carpeta se actualizó a CRUD, Swagger y readiness; el contexto anterior se conserva como motivo del cambio, no como fallo actual.

Swagger y despliegue ya están implementados y quedan fuera de este incremento. Las rutas nuevas sí deben quedar documentadas en Swagger.

## Alcance

| Método y ruta          | Acceso  | Éxito                 |
| ---------------------- | ------- | --------------------- |
| `DELETE /products/:id` | Admin   | `204` sin cuerpo      |
| `GET /users/:id`       | Admin   | `200` usuario seguro  |
| `PATCH /users/:id`     | Admin   | `200` usuario seguro  |
| `DELETE /users/:id`    | Admin   | `204` sin cuerpo      |
| `GET /health/ready`    | Público | `200 {"status":"ok"}` |

Rutas relativas a `/api/v1`. **No requiere migración ni dependencias nuevas.** La API pasa de 14 a 19 operaciones.

Este incremento reemplaza parcialmente contratos anteriores, que se conservan como historia:

- [006](../006-catalog/spec.md): «eliminación física de productos» deja de estar fuera de alcance, limitada a productos sin movimientos.
- [007](../007-jwt-only-auth/spec.md): «cambio de contraseña» deja de estar fuera de alcance, solo como cambio hecho por un admin. No hay cambio por el propio usuario ni recuperación.
- [009](../009-swagger/spec.md): el criterio S-02 («exactamente 14 operaciones») pasa a 19.

Fuera de alcance:

- Baja lógica de usuarios (columna `active`). Se registra como mejora futura.
- Cambiar el rol desde `PATCH /users/:id`. El rol sigue cambiándose solo con `PATCH /users/:id/role`.
- Editar o eliminar movimientos (RN-03 se mantiene).
- `Cache-Control: no-store` en `/products` (la colección no lo exige).

## Reglas de negocio nuevas

- **RN-08 — Eliminar producto.** Solo se elimina físicamente un producto **sin movimientos**. Con historial responde `409` y la vía correcta es `PATCH /products/:id/status`. Un producto sin movimientos siempre tiene saldo 0.
- **RN-09 — Editar usuario.** Admin puede cambiar `username` y/o `password` de cualquier usuario. Cambiar la contraseña revoca todas las sesiones del usuario editado excepto la sesión que hace la petición, y reinicia su contador y bloqueo de intentos fallidos (`login_failures`, `blocked_until`).
- **RN-10 — Eliminar usuario.** Solo se elimina físicamente un usuario **sin movimientos** (el historial referencia al responsable y es inmutable). Con movimientos responde `409`; la alternativa disponible es degradarlo a `operador`. Nunca se elimina al último admin y un admin no puede eliminarse a sí mismo. Sus sesiones se eliminan en la misma transacción por la FK `sessions.user_id ON DELETE CASCADE`, sin código adicional.
- **RN-11 — Readiness.** `GET /health/ready` comprueba PostgreSQL con `SELECT 1`. `GET /health` sigue sin consultar la base.

## Contratos

El orden de evaluación de errores es siempre: `401` (sin sesión válida) → `403` (rol) → `400` (UUID v4 / DTO) → `404` → `409`. Todas las respuestas de `/users` llevan `Cache-Control: no-store`, incluidos los errores (lo aplica el middleware existente de `configure-app.ts`). Ningún error expone detalles de PostgreSQL.

El parámetro `:id` se valida como en las rutas existentes, con `ParseUUIDPipe({ version: '4' })`; no hay un DTO de parámetro.

### `DELETE /products/:id`

- `204`: producto eliminado; después `GET /products/:id` → `404`.
- `404`: `"Producto no encontrado."` (mismo mensaje que `GET /products/:id`).
- `409`: el producto tiene movimientos. Mensaje: `"El producto tiene movimientos; desactívalo con PATCH /products/:id/status."`
- Concurrencia: la eliminación bloquea la fila del producto (`FOR UPDATE`), igual que el registro de movimientos y la edición de catálogo, así que una entrada simultánea y un borrado quedan serializados. Si el borrado gana, el movimiento posterior recibe `404` (comportamiento que `MovementsService` ya tiene); si el movimiento gana, el borrado recibe `409`. La FK `RESTRICT` de movimientos (código `23503`, restricción `stock_movements_product_id_fkey`) también se traduce a `409` como red de seguridad.

### `GET /users/:id`

- `200`: exactamente `id`, `username`, `role`, `createdAt`, `updatedAt`.
- `404`: mensaje **`"Usuario no encontrado."`** (la colección busca ese texto). Mismo texto que `PATCH /users/:id/role`; este incremento lo convierte en una constante compartida.

### `PATCH /users/:id`

- Body `UpdateUserDto`: `username?` (misma regla que en creación, `USERNAME_PATTERN` = `^[a-z0-9][a-z0-9._-]{2,63}$`) y `password?` (12–128, sin transformar).
- `400`: body vacío (`"Indica al menos un campo para editar."`), campos extra (`role`, `passwordHash`, etc.), `null` o tipos inválidos.
- `200`: usuario seguro actualizado.
- `404`: `"Usuario no encontrado."`
- `409`: `"El username ya existe."` cuando lo usa otro usuario. La unicidad la garantiza PostgreSQL (`users_username_key`), como en `POST /users`.
- Mismo `username` sin `password` → idempotente, `updatedAt` no cambia. Si llega `password` se vuelve a hashear siempre con scrypt.
- El JWT no contiene el username, así que renombrar no invalida sesiones. El historial muestra el username vigente.

### `DELETE /users/:id`

- `204`: usuario eliminado; su JWT deja de funcionar (`401`).
- `404`: `"Usuario no encontrado."`
- `409` en tres casos, evaluados en este orden y con mensajes distintos:
  1. el destino es admin y es el último admin registrado (`"No se puede eliminar al último administrador."`);
  2. el destino es el propio actor (`"No puedes eliminar tu propio usuario."`);
  3. el destino tiene movimientos (`"El usuario tiene movimientos; no se puede eliminar."`).
- El orden importa: el actor siempre es un admin revalidado, así que el único admin solo puede ser el propio actor. Evaluar primero «último admin» hace que ambas reglas sean alcanzables: con un solo admin, eliminarse responde con el mensaje de último admin; con varios admins, responde con el de auto-eliminación.
- Concurrencia entre admins: las escrituras administrativas se serializan con el bloqueo asesor `(721005,1)`. Si dos admins se eliminan mutuamente, el primero recibe `204`; el segundo sale de la espera sin sesión (eliminada por CASCADE) y recibe `401`.
- Concurrencia con movimientos: si el usuario que se elimina registra un movimiento a la vez, o bien el borrado recibe `409` (el movimiento se confirmó antes), o bien el movimiento recibe `401 "Credenciales inválidas."` (el usuario ya no existe). `MovementsService` traduce a `401` la violación de `stock_movements_user_id_fkey` (`23503`); nunca responde `500` por esta carrera.

### `GET /health/ready`

- Público, sin guards. No tiene límite de peticiones: el `ThrottlerGuard` solo se aplica en `AuthController`.
- `Cache-Control: no-store` en `200` y en `503`.
- `200 {"status":"ok"}` si `SELECT 1` responde en ≤ 2 s.
- `503` con mensaje genérico (`"Base de datos no disponible."`) si falla o vence el tiempo; sin detalles del error.
- El healthcheck de Railway y el smoke test del pipeline siguen usando `GET /health`.

## Criterios de aceptación

| ID    | Escenario                                                                         | Resultado                                                                           |
| ----- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| CA-01 | Operador hace `DELETE /products/:id`                                              | `403`, el producto sigue existiendo                                                 |
| CA-02 | Admin elimina producto sin movimientos                                            | `204`; `GET` posterior → `404`                                                      |
| CA-03 | Admin elimina producto con movimientos                                            | `409`; producto, saldo e historial intactos                                         |
| CA-04 | `DELETE /products/:id` con UUID inválido / inexistente / sin token                | `400` / `404` / `401`                                                               |
| CA-05 | Borrado y entrada simultáneos sobre el mismo producto                             | Uno gana; nunca queda movimiento huérfano ni `500`                                  |
| CA-06 | Admin consulta usuario existente / inexistente                                    | `200` seguro / `404 "Usuario no encontrado."`                                       |
| CA-07 | Operador consulta, edita o elimina usuarios                                       | `403`                                                                               |
| CA-08 | Admin cambia username a uno libre / ocupado                                       | `200` / `409`                                                                       |
| CA-09 | `PATCH /users/:id` con `{}`, `role`, `passwordHash`, `null`, username inválido    | `400`                                                                               |
| CA-10 | Admin cambia contraseña de otro usuario                                           | Login con la anterior → `401`; con la nueva → `200`; JWT previo del usuario → `401` |
| CA-11 | Admin cambia su propia contraseña                                                 | Su sesión actual sigue válida; sus otras sesiones → `401`                           |
| CA-12 | Admin elimina usuario sin movimientos                                             | `204`; JWT del eliminado → `401`; `GET /users/:id` → `404`                          |
| CA-13 | Único admin se elimina / admin se elimina habiendo otro / usuario con movimientos | `409` con el mensaje de cada caso, sin cambios                                      |
| CA-14 | Dos admins se eliminan mutuamente a la vez                                        | Uno `204` y el otro `401`; siempre queda ≥ 1 admin                                  |
| CA-15 | `GET /health/ready` con BD disponible / con consulta fallida o vencida            | `200 {"status":"ok"}` / `503` sin detalles; ambos con `no-store`                    |
| CA-16 | Swagger JSON                                                                      | Exactamente 19 operaciones; las cinco nuevas con sus códigos, incluido `503`        |
| CA-17 | Cobertura global                                                                  | ≥ 80 % en líneas, sentencias, funciones y ramas                                     |
| CA-18 | Borrado de un usuario y movimiento simultáneo de ese mismo usuario                | Borrado `409`, o movimiento `401`; nunca `500` ni movimiento sin responsable        |

## Trazabilidad con la colección Postman (carpeta 07)

| Petición Postman                                     | Criterio                                    |
| ---------------------------------------------------- | ------------------------------------------- |
| DELETE /products/:id sin historial — operador → 403  | CA-01                                       |
| DELETE /products/:id — admin elimina sin movimientos | CA-02                                       |
| GET /products/:id tras DELETE → 404                  | CA-02                                       |
| DELETE /products/:id con historial → 409             | CA-03                                       |
| GET /users/:id — admin (2 aserciones)                | CA-06                                       |
| GET /users/:id — inexistente → 404                   | CA-06                                       |
| PATCH /users/:id — admin actualiza username          | CA-08                                       |
| DELETE /users/:id — operador → 403                   | CA-07                                       |
| DELETE /users/:id — último admin → 409               | CA-13 (apunta a `adminId` con `adminToken`) |
| DELETE /users/:id — admin elimina y revoca sesiones  | CA-12                                       |
| GET /health/ready                                    | CA-15                                       |

La petición «último admin» es a la vez una auto-eliminación: responde `409` por la regla de último admin si `admin` es el único, y por la de auto-eliminación si la base tiene más admins. En ambos casos la aserción (`409`) pasa.
