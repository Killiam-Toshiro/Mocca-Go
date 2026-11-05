# Especificación 004 — autenticación JWT y TOTP

> **Reemplazada parcialmente por la [especificación 007](../007-jwt-only-auth/spec.md):** se retira el segundo factor TOTP, el enrolamiento, el desafío y la regla de «último admin con 2FA activo». Se conserva como historia; en esos puntos rige la 007.

Fecha: 2026-10-06. Autorización: el usuario pidió un cuarto commit y push de los incrementos.

## Alcance

Implementar enrolamiento inicial por script privado, setup/confirmación TOTP, login con desafío, verificación de segundo factor, JWT asociado a sesión persistida, identidad y logout. Incorporar guards reutilizables de autenticación y roles. La administración de usuarios y rutas de inventario permanecen para incrementos posteriores.

## Políticas y almacenamiento

- JWT HS256 con issuer `inventory-api`, audience `inventory-client`, `sub` UUID, `sid` UUID, vencimiento de 15 minutos. Solo se acepta ese algoritmo. No hay refresh token.
- Se requieren `JWT_SECRET` de al menos 32 bytes y `TOTP_ENCRYPTION_KEY` hexadecimal de 32 bytes, distintos. Sin defaults de producción; errores no exponen valores. Pruebas usan claves ficticias independientes.
- OTPAuth 9.5.2: TOTP SHA1, 6 dígitos, periodo de 30 segundos, ventana ±1. Secretos aleatorios de 20 bytes cifrados con AES-256-GCM e IV aleatoria de 12 bytes, con propósito y usuario asociados como AAD.
- Un contador TOTP consumido no se reutiliza, incluso en otro desafío o tras reiniciar. La confirmación de enrolamiento consume también el código; para login hay que esperar el siguiente.
- Tokens de enrolamiento y desafío: 32 bytes aleatorios, solo digest SHA256 en PostgreSQL. Enrolamiento dura 15 minutos; desafío 5 minutos; máximo 5 fallos cada uno. Consumo y creación de sesión se realizan en una transacción bajo bloqueo de usuario y prueba.
- `npm run auth:enroll -- admin` emite una credencial limitada para un usuario existente sin TOTP; invalida credenciales previas de enrolamiento. No permite quitar/resetear un segundo factor activo. No existe enrolamiento público.
- Setup repite el mismo secreto pendiente dentro del enrolamiento vigente; confirmar correctamente activa el factor y consume la credencial. El secreto y URI aparecen solo en setup autorizado, con `Cache-Control: no-store`.
- Login: username canónico de 3–64 caracteres, contraseña de 12–128. Respuesta uniforme `401` para contraseña incorrecta, usuario inexistente, bloqueado o sin TOTP. Cinco fallos consecutivos bloquean la cuenta 15 minutos; éxito reinicia contador. Se deriva scrypt también para usuarios inexistentes.
- Rutas de auth limitadas a 20 peticiones/minuto por IP y ruta mediante Throttler; los límites de cuenta y pruebas se persisten en PostgreSQL. Cinco fallos TOTP por cuenta bloquean 2FA y nuevos desafíos 15 minutos, aunque se utilicen credenciales/desafíos diferentes; éxito reinicia ese contador. El límite IP es en memoria por proceso, sin proxy trust. Para despliegue con múltiples réplicas se necesita almacenamiento compartido.
- Guard verifica firma, expiración, issuer, audience, claims, usuario y sesión vigente en BD. El rol se obtiene de BD en cada petición. Logout revoca solo esa sesión; el mismo JWT se rechaza inmediatamente y después de reiniciar.
- No hay recuperación automática de 2FA en este incremento. Pérdida del autenticador requiere intervención de mantenimiento con identidad verificada; no se implementa bypass ni reset por contraseña. Creación/roles/último admin se resolverán en administración.

## Endpoints relativos a /api/v1

| Método y ruta          | Entrada                   | Respuesta                                                            |
| ---------------------- | ------------------------- | -------------------------------------------------------------------- |
| POST /auth/2fa/setup   | `enrollmentToken`         | 201 `{secret, uri}`; 401 credencial inválida/vencida/consumida       |
| POST /auth/2fa/confirm | `enrollmentToken`, `code` | 200 `{enabled:true}`; 401 inválido, replay o intentos agotados       |
| POST /auth/login       | `username`, `password`    | 200 `{challengeToken, expiresIn:300}`; 401 uniforme                  |
| POST /auth/verify-2fa  | `challengeToken`, `code`  | 200 `{accessToken, tokenType:'Bearer', expiresIn:900}`; 401 inválido |
| GET /auth/me           | Bearer JWT                | 200 `{id, username, role}`; 401 sin sesión válida                    |
| POST /auth/logout      | Bearer JWT                | 204 vacío; 401 sin sesión válida                                     |

Campos extra, tipos/formato/longitud inválidos → 400. Rate limit IP → 429. Los DTOs no normalizan contraseñas ni aceptan privilegios públicos. Todas las respuestas auth incluyen `Cache-Control: no-store`. Errores de autenticación no revelan estado de cuenta ni secretos.

## Criterios verificables

- A-01: migración incremental agrega tablas/FKs/constraints y campos de seguridad sin alterar usuarios, hashes, catálogo ni historial.
- A-02: configuración inválida falla antes del arranque; cifrado detecta modificación o uso para otro usuario/propósito; scrypt compara con timingSafeEqual y limita parámetros a su formato conocido.
- A-03: token limitado nunca sirve como JWT; setup repetido conserva secreto, nueva emisión invalida el anterior y no altera usuario enrolado.
- A-04: sin contraseña y TOTP válidos no hay sesión; confirmar/login consume prueba y contador de forma atómica; fallos se guardan incluso al devolver 401.
- A-05: expiración, quinto fallo, token consumido, firma alterada, algoritmo/issuer/audience incorrectos, replay y concurrencia se rechazan.
- A-06: /me devuelve solo identidad; logout revoca; sesiones sobreviven al reinicio y roles actuales se consultan en BD. Guard de roles prueba admin/operador y 403 con rutas de prueba únicamente.
- A-07: Jest/Supertest/PostgreSQL real cubren flujos exitosos y fallidos; todas las métricas globales >=80%, sin excluir nuevo código.
- A-08: README documenta claves, migración, script y recorrido manual; SDD y overview registran resultados antes del commit; push real se verifica contra origin.

## Fuentes técnicas

- [JWT de NestJS](https://github.com/nestjs/jwt).
- [OTPAuth y prevención de reutilización mediante contador](https://github.com/hectorm/otpauth).
- [Rate limiting de NestJS](https://docs.nestjs.com/security/rate-limiting).
- [OWASP: segundo factor y recuperación](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
