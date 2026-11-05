# Especificación 005 — administración y autorización

> **Reemplazada parcialmente por la [especificación 007](../007-jwt-only-auth/spec.md):** se retira el segundo factor TOTP, el enrolamiento, el desafío y la regla de «último admin con 2FA activo». Se conserva como historia; en esos puntos rige la 007.

Fecha: 2026-10-07. El usuario autoriza implementar el commit 5 para completar el 5% de autorización y hacer push al finalizar.

## Alcance y trazabilidad

Completar R-03 de la rúbrica mediante rutas administrativas reales para crear usuarios, listar y asignar roles. Se reutilizan JWT/sesión/TOTP y guards del incremento 004. No se implementa registro público ni catálogo, movimientos, recuperación 2FA o despliegue.

El commit 4 `bf84eaa` está publicado en origin/main y su [CI](https://github.com/damaral2005/Taller-Backend-NestJS/actions/runs/37534758745) terminó con success. Su overview y tareas se cierran en este incremento antes de continuar.

## Contratos HTTP relativos a /api/v1

Todas las rutas requieren `AuthGuard`, después `RolesGuard`, y rol vigente `admin`. Sesión ausente/incorrecta/revocada/vencida: 401. Operador autenticado: 403. Las respuestas de `/users`, incluidos errores, llevan `Cache-Control: no-store`.

| Método y ruta         | Entrada                         | Respuesta exitosa                          |
| --------------------- | ------------------------------- | ------------------------------------------ |
| POST /users           | JSON `{username,password,role}` | 201 `{user,enrollmentToken,expiresIn:900}` |
| GET /users            | Query opcional `page`, `limit`  | 200 `{data,page,limit,total,totalPages}`   |
| PATCH /users/:id/role | UUID v4 y JSON `{role}`         | 200 usuario seguro actualizado             |

Usuario seguro: exactamente `{id,username,role,createdAt,updatedAt}`; fechas ISO-8601. Lista `data` contiene solo usuarios seguros. Contraseña/hash, secretos y contadores TOTP, bloqueos, sesiones y credenciales de enrolamiento no aparecen en listas ni cambios de rol. La creación entrega una sola credencial limitada al admin para que la comunique privadamente al nuevo usuario; no incluye el secreto TOTP ni un JWT de acceso. `enrollmentToken` se usa en setup/confirmación existentes y la contraseña se guarda con scrypt.

Validaciones:

- Username obligatorio canónico: regex `^[a-z0-9][a-z0-9._-]{2,63}$`, sin transformación automática. Password string de 12–128 caracteres, sin trim/normalización. Rol obligatorio `admin` u `operador`.
- Page y limit, si se suministran, strings decimales sin signos, espacios, fracciones ni ceros iniciales; page entre 1 y 10000, limit entre 1 y 100. Defaults 1 y 20. Arrays y campos extra → 400.
- Listado estable ordenado por username ascendente e ID; página fuera del total → data vacía. `totalPages = ceil(total / limit)`, cero si no existen registros.
- UUID inválido, body/query inválido o campos no permitidos → 400. Username duplicado → 409 sin detalles SQL. Usuario destino inexistente → 404.
- Rol idéntico es una operación idempotente: 200 sin modificar timestamps, contraseña, factor ni historial.

## Seguridad y concurrencia

Crear usuario y su credencial de enrolamiento ocurre en una sola transacción, reutilizando el emisor del incremento 004 con el EntityManager de esa transacción. Un fallo no deja usuario sin credencial; solicitudes duplicadas concurrentes crean solo un usuario y una prueba.

Todas las escrituras administrativas adquieren primero el bloqueo asesor transaccional `(721005,1)` y vuelven a comprobar sesión/rol del actor después de adquirirlo. El listado adquiere su variante compartida, vuelve a comprobar el actor y consulta filas/total dentro de la misma transacción. El bloqueo cubre todas las instancias conectadas a esa BD; modificaciones externas directas de roles están fuera de este protocolo.

Cambiar rol bloquea después la fila destino. Degradar un admin se rechaza con 409 si es el último admin registrado. Además, si tiene TOTP activo, se rechaza cuando no existe otro admin con TOTP activo. Crear un admin pendiente de enrolamiento no permite degradar al único admin capaz de autenticarse. Esta política se aplica también a degradaciones propias y simultáneas. Los bloqueos de intentos son temporales y no se consideran desactivación del usuario.

Un cambio de rol no reemplaza contraseña/TOTP ni revoca automáticamente la sesión: el JWT conserva identidad/sesión, y el guard consulta el rol vigente en cada nueva petición. Peticiones en espera para crear o cambiar roles revalidan la autorización al obtener el bloqueo; un actor recién degradado recibe 403 y no modifica datos. Logout o expiración durante esa espera produce 401.

## Criterios de aceptación

- U-01: las tres rutas devuelven 401 sin sesión y 403 para operador; un token de enrolamiento tampoco permite administración.
- U-02: admin crea ambos roles, usuario seguro y credencial limitada; contraseña hasheada y digest persistidos. El usuario nuevo enrola TOTP e inicia sesión por el flujo existente, sin bypass.
- U-03: DTOs/body/query/UUID rechazan entradas inválidas; duplicados producen 409 sin secretos ni SQL. Paginación/defaults/orden/página vacía correctos.
- U-04: admin cambia rol y la misma sesión refleja promoción/degradación en las siguientes peticiones. El actor degradado no se autoasigna privilegios.
- U-05: último admin y último admin enrolado protegidos; rol idéntico no cambia datos. Dos degradaciones concurrentes nunca dejan la instalación sin admin enrolado.
- U-06: actor degradado, sesión revocada o vencida mientras espera se rechaza dentro de la transacción. Creación/credencial y cambios de rol se revierten ante fallos; no se alteran catálogo ni movimientos.
- U-07: pruebas unitarias Jest y HTTP Supertest/PostgreSQL real, incluidas concurrencia y rollback; regresiones pasan y las cuatro métricas globales permanecen >=80%, sin excluir código.
- U-08: README y recorrido manual de administración, decisiones, trazabilidad, tareas y overview actualizados antes del quinto commit; push autorizado y CI verificados después.

## Fuentes técnicas

- [PostgreSQL: bloqueos transaccionales y orden consistente](https://www.postgresql.org/docs/16/explicit-locking.html).
- [TypeORM: operaciones con EntityManager de la transacción](https://typeorm.io/docs/advanced-topics/transactions/).
