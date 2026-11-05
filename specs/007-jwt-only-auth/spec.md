# Especificación 007 — autenticación solo con JWT (retiro del 2FA)

Fecha: implementación 2026-10-10; auditoría documental 2026-10-13. Estado: implementado/publicado e integrado en main (`cc5eee2`, `725d69a`, `2a86b32`). Decisiones D-A a D-D aprobadas por el grupo. El usuario ratifica el 2026-10-13 que 2FA queda fuera del alcance de aquí en adelante (D-65); R-02 vigente se verifica con JWT-only. Reemplaza parcialmente las especificaciones [004](../004-authentication/spec.md) y [005](../005-users/spec.md); esos documentos se conservan como historia.

## Motivo y alcance

El grupo implementó login con contraseña + TOTP (incrementos 004 y 005). Se decide dejar como único mecanismo de autenticación **usuario y contraseña que producen un JWT**. Se mantienen las sesiones persistidas, para que `logout` siga revocando el token (HU-03).

Este incremento **retira** enrolamiento, setup/confirmación TOTP, desafío de segundo factor, cifrado de secretos TOTP, el script `auth:enroll` y la regla de «último admin con 2FA activo». **No añade** funcionalidades nuevas: no hay refresh tokens, cambio ni recuperación de contraseña, ni registro público.

El enunciado original incluía JWT y 2FA. La instrucción posterior del usuario el 2026-10-13 excluye 2FA del seguimiento y fija el alcance JWT-only. La auditoría documenta ese cambio y verifica la implementación existente; no se atribuye esta decisión al docente ni se modifica código.

## Decisiones (aprobadas)

| ID  | Propuesta (recomendada)                                                                                                         | Alternativa descartada                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| D-A | Mantener sesiones en PostgreSQL: el JWT lleva `sub` y `sid`, el guard comprueba sesión vigente y `logout` revoca.               | JWT sin estado: más simple, pero `logout` no podría revocar el token. |
| D-B | `POST /users` devuelve directamente el usuario seguro `{id,username,role,createdAt,updatedAt}`, sin credencial de enrolamiento. | Conservar `{user}`: añade un nivel sin necesidad.                     |
| D-C | Conservar el bloqueo de cuenta por contraseña (5 fallos → 15 minutos) y el límite por IP (20/min).                              | Quitarlos: sin segundo factor, la contraseña es la única barrera.     |
| D-D | La migración elimina de forma definitiva los secretos y contadores TOTP; `down()` restaura la estructura, no los secretos.      | Dejar columnas inertes: datos sensibles sin uso y código muerto.      |

## Contratos HTTP relativos a /api/v1

Todas las respuestas de `/auth/*` conservan `Cache-Control: no-store`.

| Método y ruta     | Entrada                | Respuesta                                                            |
| ----------------- | ---------------------- | -------------------------------------------------------------------- |
| POST /auth/login  | `username`, `password` | 200 `{accessToken, tokenType:'Bearer', expiresIn:900}`; 401 uniforme |
| GET /auth/me      | Bearer JWT             | 200 `{id, username, role}`; 401 sin sesión válida                    |
| POST /auth/logout | Bearer JWT             | 204 vacío; 401 sin sesión válida                                     |

Rutas retiradas, que pasan a responder **404**: `POST /auth/2fa/setup`, `POST /auth/2fa/confirm` y `POST /auth/verify-2fa`.

Cambio en administración de usuarios (resto de contratos de la 005 sin cambios):

| Método y ruta | Antes (005)                                | Ahora                                         |
| ------------- | ------------------------------------------ | --------------------------------------------- |
| POST /users   | 201 `{user,enrollmentToken,expiresIn:900}` | 201 usuario seguro; sin credencial ni secreto |

## Reglas

- **Login:** `username` canónico de 3–64 caracteres y contraseña de 12–128, sin normalización (igual que hoy). Con credenciales correctas se crea una sesión de 15 minutos y se emite el JWT en la misma transacción. Cualquier usuario con contraseña válida puede entrar, incluidos `admin` y `operador` del seed, sin ningún paso previo.
- **Errores:** `401` uniforme para contraseña incorrecta, usuario inexistente o cuenta bloqueada, sin revelar estado. Se sigue derivando scrypt para usuarios inexistentes. Cinco fallos consecutivos bloquean la cuenta 15 minutos y un éxito reinicia el contador. Campos extra o formatos inválidos → `400`. Exceso por IP → `429`.
- **JWT:** sin cambios. HS256, issuer `inventory-api`, audience `inventory-client`, `sub` y `sid` UUID v4, vencimiento de 15 minutos, sin refresh. El guard verifica firma, algoritmo, issuer, audience, expiración, claims y sesión vigente en BD, y toma el rol vigente de la BD en cada petición. Logout revoca solo esa sesión.
- **Último admin:** se rechaza con `409` degradar al último admin registrado. Desaparece la regla adicional del «único admin con TOTP activo», que carece de sentido sin segundo factor. El bloqueo asesor `(721005,1)` y la revalidación de actor y sesión de la 005 se conservan.
- **Crear usuario:** sigue siendo transaccional con el bloqueo asesor, y valida username, contraseña y rol como en la 005. Ya no emite credencial de enrolamiento. El nuevo usuario inicia sesión directamente con la contraseña que el admin le comunicó.

## Datos y configuración

- **Migración incremental nueva** (`1791244802000`), sin editar las anteriores: elimina `users.totp_secret`, `last_totp_counter`, `totp_failures`, `totp_blocked_until`, las restricciones `users_totp_failures_valid` y `users_totp_counter_valid`, y la tabla `auth_proofs`. Conserva `login_failures`, `blocked_until`, `sessions`, usuarios, hashes, roles, catálogo e historial. `down()` recrea la estructura vacía.
- **Sesiones existentes:** las sesiones y JWT emitidos antes de la migración siguen vigentes hasta vencer. Las credenciales de enrolamiento y los desafíos pendientes dejan de existir.
- **Configuración:** `TOTP_ENCRYPTION_KEY` deja de exigirse, de leerse y de validarse. `JWT_SECRET` (≥32 bytes) sigue siendo obligatoria. Un `.env` antiguo que aún contenga `TOTP_ENCRYPTION_KEY` **no falla**: la variable se ignora.
- **Retiros:** `otpauth` y su uso, el cifrado AES-256-GCM, la tabla y entidad `AuthProof`, `enrollment.ts`, `enroll.ts`, el script `npm run auth:enroll`, los DTOs de setup/confirm/verify y las referencias en README, CI, `.env.example` y pruebas.
- Se conservan `@nestjs/throttler`, `@nestjs/jwt`, scrypt y las constantes del JWT.

## Seguridad: qué se pierde y cómo se compensa

Quitar el segundo factor reduce la seguridad: una contraseña filtrada ya basta para entrar. Se compensa con lo que se conserva: contraseña de 12–128 caracteres con scrypt, bloqueo de cuenta, límite por IP, JWT de 15 minutos y sesiones revocables. Esta es una decisión de alcance del grupo y queda registrada en `docs/decisions.md`. Cualquier entorno compartido debe usar contraseñas propias, no las de demostración.

## Criterios de aceptación

- J-01: `POST /auth/login` con credenciales válidas devuelve 200 y un JWT utilizable de inmediato en `/auth/me` y en rutas protegidas, incluso para usuarios que nunca configuraron TOTP (admin y operador del seed).
- J-02: credenciales inválidas, usuario inexistente o cuenta bloqueada → 401 uniforme. Cinco fallos bloquean 15 minutos, persisten y se reinician al vencer o tras un éxito. Límite por IP → 429.
- J-03: las tres rutas retiradas responden 404 y ninguna respuesta de autenticación menciona segundo factor, desafío ni enrolamiento.
- J-04: JWT alterado, de otro algoritmo, issuer o audience, vencido, con claims inválidos, de sesión ausente/vencida/revocada → 401. Logout revoca solo su sesión y las demás siguen activas. El rol vigente de BD manda en cada petición.
- J-05: `POST /users` devuelve 201 con usuario seguro, sin credencial ni secretos. El usuario creado inicia sesión con su contraseña; duplicado → 409; DTOs inválidos → 400; 401 sin sesión y 403 para operador.
- J-06: degradar al último admin → 409; con más de un admin se permite, aunque ninguno tenga «segundo factor». Dos degradaciones concurrentes nunca dejan la instalación sin admin; rol idéntico es idempotente; la revalidación de actor y sesión bajo bloqueo se mantiene.
- J-07: la migración, aplicada sobre una BD con datos del esquema anterior (usuarios con y sin TOTP, sesiones, productos y movimientos), conserva usuarios, hashes, roles, sesiones y datos de inventario, y elimina solo la estructura 2FA. `down()` restaura la estructura sin alterar el resto.
- J-08: la aplicación arranca sin `TOTP_ENCRYPTION_KEY`; falla con mensaje claro si falta o es débil `JWT_SECRET`; un `.env` antiguo con la variable obsoleta no impide el arranque.
- J-09: no quedan referencias a TOTP, enrolamiento, `auth_proofs`, `otpauth` ni `auth:enroll` en `src`, `test`, scripts, CI, `.env.example` ni README, salvo la migración histórica y las especificaciones 004/005 marcadas como reemplazadas.
- J-10: pruebas Jest y Supertest sobre PostgreSQL real, con las suites de auth, users, products y seed adaptadas; las cuatro métricas globales permanecen ≥80% sin excluir código; proceso compilado verificado.
- J-11: README (recorrido de login simplificado), decisiones, trazabilidad R-02 en la 001, marcas de reemplazo en 004/005, tareas y overview actualizados antes del commit; push y CI verificados después.

## Fuera de alcance

> El cambio de contraseña hecho por un admin se incorpora en [la especificación 011](../011-crud-completion/spec.md) (D-61).

Refresh tokens, cambio, olvido o recuperación de contraseña, registro público, bloqueo manual de cuentas y rotación de `JWT_SECRET`.

## Fuentes técnicas

- [JWT de NestJS](https://github.com/nestjs/jwt).
- [OWASP: Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
