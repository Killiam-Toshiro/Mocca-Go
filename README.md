# Taller Backend NestJS — API de inventario

Backend académico para administrar productos, existencias y movimientos de inventario con NestJS y PostgreSQL. El proyecto se desarrolla mediante **Spec-Driven Design con archivos versionados**: especificar, planificar, implementar, verificar y actualizar la documentación en cada commit.

Repositorio: [Taller-Backend-NestJS](https://github.com/damaral2005/Taller-Backend-NestJS).

## Estado actual

Main actualizado/verificado a `635e928` el 2026-10-13. Incluye seed/PostgreSQL, JWT con sesiones revocables, roles, catálogo, movimientos, Swagger, despliegue Railway y CRUD completo/readiness. La colección Postman está versionada; el usuario confirma corridas exitosas locales y desplegadas. El informe está terminado según el usuario, pendiente de compartir para revisión documental.

**Alcance acordado (2026-10-13):** el usuario excluye 2FA de los requisitos de aquí en adelante. La autenticación vigente es usuario/contraseña → JWT, con sesiones persistidas y logout revocable. El enunciado original incluía 2FA; se conserva como antecedente, mientras que el SDD y el seguimiento actual usan el alcance JWT-only aprobado (D-65).

El código incluye 19 operaciones: dos de health, tres de autenticación, seis de usuarios, seis de catálogo y dos de movimientos.

La carpeta `2026-2-nestjs-postgres` se utiliza como referencia del curso. El desarrollo propio se realiza en `Taller Backend – NestJS`; no se modifica el ejemplo ni se copia su historial.

## Documentación

- [Especificación: alcance, reglas, endpoints previstos y rúbrica](specs/001-inventory/spec.md).
- [Plan técnico y alcance de los primeros tres commits](specs/001-inventory/plan.md).
- [Tareas y estado de avance](specs/001-inventory/tasks.md).
- [Decisiones y asuntos pendientes](docs/decisions.md).
- [Overview y verificación del commit 1](docs/commits/001.md).
- [Especificación de la base ejecutable](specs/002-bootstrap/spec.md), [plan](specs/002-bootstrap/plan.md) y [tareas](specs/002-bootstrap/tasks.md).
- [Overview y verificación del commit 2](docs/commits/002.md).
- [Especificación de persistencia y seed](specs/003-persistence/spec.md), [plan](specs/003-persistence/plan.md) y [tareas](specs/003-persistence/tasks.md).
- [Overview y verificación del commit 3](docs/commits/003.md).
- [Especificación de autenticación](specs/004-authentication/spec.md), [plan](specs/004-authentication/plan.md) y [tareas](specs/004-authentication/tasks.md).
- [Overview y verificación del commit 4](docs/commits/004.md).
- [Especificación de administración y roles](specs/005-users/spec.md), [plan](specs/005-users/plan.md) y [tareas](specs/005-users/tasks.md).
- [Overview y verificaciones del commit 5](docs/commits/005.md).
- [Especificación del catálogo de productos](specs/006-catalog/spec.md), [plan](specs/006-catalog/plan.md) y [tareas](specs/006-catalog/tasks.md).
- [Overview y verificaciones del commit 6](docs/commits/006.md).
- [Especificación del retiro del 2FA](specs/007-jwt-only-auth/spec.md), [plan](specs/007-jwt-only-auth/plan.md) y [tareas](specs/007-jwt-only-auth/tasks.md).
- [Overview y verificaciones del commit 7](docs/commits/007.md).
- [Especificación de la documentación OpenAPI/Swagger](specs/009-swagger/spec.md), [plan](specs/009-swagger/plan.md) y [tareas](specs/009-swagger/tasks.md).
- [Overview y verificaciones del incremento 9](docs/commits/009.md).
- [Especificación del CRUD completo y readiness](specs/011-crud-completion/spec.md), [plan](specs/011-crud-completion/plan.md) y [tareas](specs/011-crud-completion/tasks.md).
- [Overview y verificaciones del incremento 11](docs/commits/011.md).
- [Especificación de despliegue](specs/010-deployment/spec.md), [tareas](specs/010-deployment/tasks.md) y [cierre con URL/CI](docs/commits/010.md).
- [Auditoría de main, pruebas y rúbrica del 2026-10-13](docs/audits/2026-10-13-main.md).
- [Guía para colaborar con Spec-Driven Design](docs/CONTRIBUTING.md).

## Flujo de trabajo por commit

1. Revisar la especificación, las decisiones y la tarea que corresponde.
2. Actualizar primero los criterios de aceptación si cambia el comportamiento previsto.
3. Implementar únicamente el alcance del commit actual.
4. Ejecutar las comprobaciones aplicables y registrar los resultados reales.
5. Actualizar especificación, plan, tareas y overview antes de cerrar el commit.
6. Revisar con el grupo el overview antes de iniciar el siguiente commit.

Los cambios de alcance se registran; una tarea pendiente no se presenta como completada. Los commits deben reflejar las contribuciones reales de cada integrante, sin atribuir trabajo a otras personas.

## Incrementos

| Commit | Alcance                                                            | Estado                                                        |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1      | Especificación de inventario, rúbrica y flujo de trabajo           | Cerrado; usuario autorizó avanzar                             |
| 2      | Base NestJS, configuración, validación, health y pruebas iniciales | Ver resultados y estado en el [overview](docs/commits/002.md) |
| 3      | PostgreSQL, migración inicial, seed y pruebas de persistencia      | Ver resultados y estado en el [overview](docs/commits/003.md) |
| 4      | JWT, sesiones revocables y guards (TOTP retirado en el 7)          | Ver resultados y estado en el [overview](docs/commits/004.md) |
| 5      | Crear/listar usuarios, asignar roles y proteger al último admin    | Ver resultados y estado en el [overview](docs/commits/005.md) |
| 6      | Catálogo: crear, listar, consultar, editar y activar/desactivar    | Ver resultados y estado en el [overview](docs/commits/006.md) |
| 7      | Retiro del 2FA: login directo con JWT y sesiones revocables        | Ver resultados y estado en el [overview](docs/commits/007.md) |
| 9      | Documentación OpenAPI con Swagger UI                               | Ver resultados y estado en el [overview](docs/commits/009.md) |
| 11     | CRUD completo de productos y usuarios, readiness y colección       | Ver resultados y estado en el [overview](docs/commits/011.md) |

El despliegue ya está verificado. Quedan revisar el informe final cuando se comparta y confirmar la entrega en Intu. Swagger complementa el informe, pero no lo sustituye.

## Requisitos y ejecución

- Node.js **24**, versión 24.15.0 o superior dentro de esa versión mayor (`.nvmrc`).
- npm **11**.
- Docker Desktop iniciado, con motor Linux y Docker Compose, para ejecutar PostgreSQL **16.15**. También puede usarse un servidor PostgreSQL externo configurando las variables de conexión.

Desde la raíz del repositorio:

```bash
npm ci
```

Crear la configuración local en PowerShell:

```powershell
Copy-Item .env.example .env
```

En Bash se puede usar `cp .env.example .env`. El archivo `.env` no se versiona. Si ya existe, incorpora las nuevas variables sin reemplazar tus valores. Las credenciales del ejemplo son solo de demostración local; establece valores propios en cualquier entorno compartido.

Antes del primer arranque, genera la clave de firma de los JWT en `.env` (comando válido en PowerShell y Bash):

```bash
node -e "const fs = require('node:fs'), c = require('node:crypto'); fs.appendFileSync('.env', '\nJWT_SECRET=' + c.randomBytes(32).toString('hex') + '\n');"
```

Ejecuta ese comando una sola vez al configurar tu entorno. Conserva la clave: cambiarla invalida los JWT emitidos; la rotación requiere un procedimiento que aún no se implementa. Si tu `.env` antiguo aún contiene `TOTP_ENCRYPTION_KEY`, la variable se ignora y puedes borrarla.

| Variable           | Por defecto         | Regla                                                                   |
| ------------------ | ------------------- | ----------------------------------------------------------------------- |
| `NODE_ENV`         | `development`       | `development`, `test` o `production`                                    |
| `PORT`             | `3000`              | Entero entre 1 y 65535, escrito solo con dígitos                        |
| `DB_HOST`          | `127.0.0.1`         | Host de PostgreSQL                                                      |
| `DB_PORT`          | `5433`              | Entero entre 1 y 65535                                                  |
| `DB_NAME`          | `inventory`         | Identificador en minúsculas; en test debe terminar en `_test`           |
| `DB_USERNAME`      | `inventory`         | Usuario de PostgreSQL                                                   |
| `DB_PASSWORD`      | Sin valor en código | Obligatoria; `.env.example` contiene una clave de demostración local    |
| `DB_SCHEMA`        | `public`            | Identificador en minúsculas, máximo 63 caracteres                       |
| `DB_SSL`           | `false`             | `true` o `false`; con `true` se verifica el certificado                 |
| `JWT_SECRET`       | Sin valor           | Al menos 32 bytes; firma los JWT (HS256)                                |
| `TRUST_PROXY_HOPS` | `0`                 | Entero de 0 a 10: proxies de confianza; `1` en Railway (ver despliegue) |

Preparar la base y cargar los registros iniciales:

```bash
npm run db:up
npm run migration:run
npm run seed
```

Los comandos de migración y seed compilan el proyecto antes de ejecutarse. El seed requiere `SEED_ADMIN_PASSWORD` y `SEED_OPERATOR_PASSWORD` de 12 a 128 caracteres, declaradas en `.env` o en el proceso. Crea `admin`, `operador`, tres productos y entradas iniciales con saldos 20, 30 y 10. Las contraseñas se guardan con scrypt y salt aleatoria.

Repetir `npm run seed` conserva contraseñas, roles, catálogo, saldos e historial existentes y no aplica de nuevo las entradas ya identificadas. Si existe un producto activo sin su entrada inicial, se añade esa entrada a su saldo previo; si está inactivo, se rechaza la carga completa. Todo el seed es una transacción. Para iniciar sesión usa el recorrido siguiente: basta usuario y contraseña.

Desarrollo tiene un volumen persistente en Docker. `docker compose stop postgres` detiene ese servicio conservando los datos, y `npm run db:up` lo vuelve a iniciar. No es necesario borrar volúmenes para repetir el seed.

`npm run migration:revert` revierte la última migración: la del incremento 7 restaura la estructura 2FA vacía (los secretos TOTP eliminados no se recuperan); la de autenticación elimina sesiones; la inicial elimina inventario/usuarios. Ambas reversiones **eliminan datos** y se prueban solo sobre bases descartables. La aplicación no ejecuta migraciones ni seed al arrancar; `synchronize` y `dropSchema` están desactivados.

Las variables del proceso prevalecen sobre `.env`. Cuando `NODE_ENV=test`, no se carga `.env`. Una configuración inválida impide arrancar y el mensaje indica qué variable corregir sin mostrar su valor.

```bash
npm run start:dev
```

Consultar `http://localhost:3000/api/v1/health` (o el puerto configurado):

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health
```

Respuesta HTTP `200`:

```json
{ "status": "ok" }
```

Es una comprobación pública de disponibilidad del proceso y no consulta la base. La ruta `/health` sin prefijo devuelve `404`.

`GET /api/v1/health/ready` también es pública y sí comprueba PostgreSQL con `SELECT 1` (límite de 2 segundos): responde `200 {"status":"ok"}` o `503` con el mensaje genérico `Base de datos no disponible.`, siempre con `Cache-Control: no-store`. El healthcheck de Railway y el smoke test siguen usando `/health`.

Para ejecutar el build:

```bash
npm run build
npm run start:prod
```

## Documentación interactiva (Swagger)

Con la API iniciada, abre en el navegador:

- `http://localhost:3000/api/v1/docs`: Swagger UI, con todas las rutas agrupadas por módulo (`health`, `auth`, `users`, `products`, `movements`).
- `http://localhost:3000/api/v1/docs-json`: el documento OpenAPI 3 en JSON. Postman puede importarlo con **Import → Link** o pegando el archivo.

Para probar una ruta protegida desde Swagger UI:

1. Abre `POST /auth/login`, pulsa **Try it out**, envía `{"username":"admin","password":"<SEED_ADMIN_PASSWORD>"}` y copia `accessToken`.
2. Pulsa **Authorize** (arriba a la derecha), pega el token sin escribir `Bearer` y confirma.
3. Usa **Try it out** en cualquier ruta. Con un token de `operador`, las rutas de solo admin responden `403`.

Cada operación indica qué rol la puede usar, sus parámetros con los mismos límites que valida la API y sus respuestas (`200/201/204` y los errores `400/401/403/404/409/429` que correspondan). Ambas rutas son públicas y están activas en todos los entornos, incluida la API desplegada: solo describen contratos, y Swagger no omite guards, validaciones ni límites de intentos. El token no se guarda en el navegador; al recargar la página hay que volver a pulsar **Authorize**. Los recursos de la interfaz se sirven desde la propia API, sin CDN.

La documentación se genera con `@nestjs/swagger` a partir de los controladores y DTOs (`src/swagger.ts`, decoradores `@Api*` y clases `*.responses.ts`). Al añadir una ruta hay que documentarla: `test/swagger.e2e-spec.ts` compara la lista exacta de operaciones y falla si aparece una ruta sin incluir.

## Colección Postman

`postman/Taller Backend NestJS — Inventario (JWT).postman_collection.json` es autocontenida (sus variables viven en la colección) y recorre casos exitosos y errores de todas las rutas en las carpetas 00 a 10. Trae las contraseñas de demostración de `.env.example`; si tu seed usa otras, cámbialas en la pestaña **Variables**. Con migración, seed y API iniciados:

```bash
postman collection run "postman/Taller Backend NestJS — Inventario (JWT).postman_collection.json"
```

También se puede importar en Postman y ejecutar con el Collection Runner. Cada corrida crea usuarios `qa_*` y productos `QA-*`; el límite de 20 peticiones por minuto en `/auth/*` obliga a esperar un minuto entre corridas completas.

## Autenticación: recorrido manual

La autenticación usa solo usuario y contraseña, que producen un JWT. No hay segundo factor ni paso previo de enrolamiento. Con migraciones y seed aplicados y la API iniciada (los usuarios `admin` y `operador` del seed usan `SEED_ADMIN_PASSWORD` y `SEED_OPERATOR_PASSWORD`):

```powershell
$base = 'http://localhost:3000/api/v1'
$session = Invoke-RestMethod -Method Post "$base/auth/login" -ContentType 'application/json' -Body (@{ username = 'admin'; password = '<SEED_ADMIN_PASSWORD>' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($session.accessToken)" }
Invoke-RestMethod "$base/auth/me" -Headers $headers
Invoke-RestMethod -Method Post "$base/auth/logout" -Headers $headers
# Repetir /auth/me con los mismos headers debe fallar con 401.
```

| Ruta                | Entrada                | Resultado                                                   |
| ------------------- | ---------------------- | ----------------------------------------------------------- |
| `POST /auth/login`  | `username`, `password` | `200`: `{accessToken, tokenType:'Bearer', expiresIn:900}`   |
| `GET /auth/me`      | Bearer JWT             | `200`: `{id,username,role}` sin secretos                    |
| `POST /auth/logout` | Bearer JWT             | `204`: sesión revocada; después el mismo JWT devuelve `401` |

Las rutas son relativas a `/api/v1`. Las antiguas `/auth/2fa/setup`, `/auth/2fa/confirm` y `/auth/verify-2fa` fueron retiradas y devuelven `404`. Se rechazan campos adicionales con `400`; credenciales inválidas, usuario inexistente o cuenta bloqueada con el mismo `401`; exceso de peticiones con `429`. Username canónico y contraseña de 12–128 caracteres. Cinco fallos de contraseña bloquean el login de esa cuenta 15 minutos y un éxito reinicia el contador. El límite por IP/ruta es 20 peticiones/minuto en memoria por proceso.

El JWT es HS256, dura 15 minutos y no hay refresh. Cada login crea una sesión en PostgreSQL; el guard comprueba JWT y sesión y toma el rol vigente de BD, y `logout` revoca solo esa sesión. Todas las respuestas auth llevan `Cache-Control: no-store`. Sin segundo factor, la contraseña es la única barrera: usa contraseñas propias en cualquier entorno compartido. Un admin puede cambiar la contraseña de un usuario con `PATCH /users/:id`; no hay cambio por el propio usuario, recuperación de contraseña, refresh tokens ni rotación de claves automatizada.

## Administración de usuarios y roles

Después de iniciar sesión como admin, usa el Bearer JWT obtenido. Un operador recibe `403` y una petición sin sesión válida recibe `401` en las seis rutas. No existe registro público.

| Ruta relativa a `/api/v1` | Parámetros                                                 | Respuesta                                   |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| `POST /users`             | JSON `username`, `password`, `role` (`admin` u `operador`) | `201`: usuario seguro                       |
| `GET /users`              | `page` opcional 1–10000, `limit` opcional 1–100            | `200`: `{data,page,limit,total,totalPages}` |
| `GET /users/:id`          | UUID v4                                                    | `200`: usuario seguro                       |
| `PATCH /users/:id`        | UUID v4, JSON `username` y/o `password`                    | `200`: usuario seguro actualizado           |
| `DELETE /users/:id`       | UUID v4                                                    | `204` sin cuerpo                            |
| `PATCH /users/:id/role`   | UUID v4, JSON `{role}`                                     | `200`: usuario seguro actualizado           |

Usuario seguro contiene solo `id`, `username`, `role`, `createdAt` y `updatedAt`, con fechas ISO-8601. El listado no devuelve credenciales. La creación ya no emite credencial de enrolamiento: el admin comunica privadamente la contraseña inicial y el nuevo usuario inicia sesión directamente con ella.

Username debe ser canónico: 3–64 caracteres, minúsculas ASCII, dígitos y `._-`, empezando por letra/dígito. Password de 12–128 caracteres, sin transformación. Body/query con campos extra, UUID/rol/formato inválido → `400`; username duplicado → `409`; destino inexistente → `404`. No se aceptan campos para editar hash, contraseña o stock en el cambio de rol.

Paginación predeterminada: página 1, límite 20. Query debe contener dígitos sin ceros iniciales; no se aceptan signos, espacios, exponentes, fracciones ni valores repetidos/arrays. Orden por username e ID; una página fuera del total devuelve `data:[]`.

Se rechaza con `409` degradar al último admin registrado. El rol idéntico es idempotente; cambiarlo conserva contraseña e historial. La misma sesión refleja sus nuevos permisos sin volver a iniciar sesión. Transacciones con bloqueo asesor serializan cambios administrativos y revalidan sesión/rol al salir de la espera, protegiendo contra cambios concurrentes. Todas las respuestas de administración, incluidos errores, llevan `Cache-Control: no-store`.

Ejemplo PowerShell después del recorrido de autenticación anterior (`$base` y `$headers` siguen definidos; utiliza una sesión vigente que no hayas cerrado):

```powershell
$newUser = Invoke-RestMethod -Method Post "$base/users" -Headers $headers -ContentType 'application/json' -Body (@{ username = 'nuevo_operador'; password = '<contraseña_propia_de_12_a_128_caracteres>'; role = 'operador' } | ConvertTo-Json)
# El nuevo usuario ya puede iniciar sesión con la contraseña que le comuniques.
Invoke-RestMethod "$base/users?page=1&limit=20" -Headers $headers
Invoke-RestMethod -Method Patch "$base/users/$($newUser.id)/role" -Headers $headers -ContentType 'application/json' -Body (@{ role = 'admin' } | ConvertTo-Json)
```

`PATCH /users/:id` acepta `username` y/o `password` con las mismas reglas que la creación; el body vacío, `null` o campos extra como `role` reciben `400`, y un username ocupado `409`. Repetir el mismo username no modifica `updatedAt`. Cambiar la contraseña revoca todas las sesiones del usuario editado salvo la que hace la petición y reinicia su bloqueo de intentos; renombrar no invalida sesiones.

`DELETE /users/:id` solo elimina usuarios sin movimientos, porque el historial conserva a su responsable. Responde `409` si el destino es el último admin, si es tu propio usuario o si tiene movimientos (cada caso con su mensaje); para retirar a un usuario con historial, degrádalo a `operador`. Al eliminarlo, sus sesiones desaparecen y su JWT recibe `401` de inmediato.

```powershell
Invoke-RestMethod "$base/users/$($newUser.id)" -Headers $headers
Invoke-RestMethod -Method Patch "$base/users/$($newUser.id)" -Headers $headers -ContentType 'application/json' -Body (@{ username = 'operador_renombrado' } | ConvertTo-Json)
Invoke-RestMethod -Method Delete "$base/users/$($newUser.id)" -Headers $headers
```

## Catálogo de productos

Todas las rutas requieren Bearer JWT de una sesión iniciada con `POST /auth/login`. Cualquier usuario autenticado (admin u operador) puede leer; solo admin puede crear, editar, activar/desactivar y eliminar. Sin sesión válida → `401`; operador en una ruta de escritura → `403`. La autorización se resuelve antes de validar el cuerpo.

| Ruta relativa a `/api/v1`    | Acceso | Entrada                                                  | Respuesta                                   |
| ---------------------------- | ------ | -------------------------------------------------------- | ------------------------------------------- |
| `POST /products`             | Admin  | JSON `sku`, `name`, `description` opcional               | `201`: producto con `stock` 0 y activo      |
| `GET /products`              | Todos  | `page`, `limit`, `search`, `active` opcionales           | `200`: `{data,page,limit,total,totalPages}` |
| `GET /products/:id`          | Todos  | UUID v4                                                  | `200`: producto                             |
| `PATCH /products/:id`        | Admin  | UUID v4, JSON `name` y/o `description` (`null` la borra) | `200`: producto actualizado                 |
| `PATCH /products/:id/status` | Admin  | UUID v4, JSON `{active}` booleano                        | `200`: producto actualizado                 |
| `DELETE /products/:id`       | Admin  | UUID v4                                                  | `204` sin cuerpo                            |

Producto: exactamente `{id,sku,name,description,active,stock,createdAt,updatedAt}`; `description` es `null` si no existe y las fechas son ISO-8601. `stock` es de solo lectura: ninguna ruta de catálogo lo escribe; cambiará únicamente con los movimientos.

SKU canónico, sin transformación automática: `^[A-Z0-9][A-Z0-9._-]{0,47}$` (1–48 caracteres; un SKU en minúsculas recibe `400`) e inmutable. `name`: 1–120 caracteres con algún carácter visible. `description`: 1–500 caracteres. Los textos no admiten el carácter NUL. Campos extra (`stock`, `active`, `sku`, `id`, fechas…), body vacío en la edición, UUID/body/query inválidos → `400`. SKU duplicado → `409` sin detalles de SQL. Producto inexistente → `404`.

Listado: misma paginación que usuarios (defaults 1 y 20; `page` 1–10000, `limit` 1–100, texto decimal sin ceros iniciales ni valores repetidos). `search` (1–64 caracteres) busca texto parcial en SKU o nombre sin distinguir mayúsculas y trata `%`, `_` y `\` como texto literal. `active` admite solo `true` o `false`; sin él se listan también los inactivos. Orden por SKU e ID; una página fuera del total devuelve `data:[]`.

Editar o cambiar el estado bloquea la fila del producto, compara y solo escribe las columnas de catálogo que cambian: repetir los mismos valores responde `200` sin modificar `updatedAt`, y una edición nunca pisa un saldo confirmado por otra transacción. Desactivar conserva datos, saldo e historial.

`DELETE /products/:id` elimina físicamente solo un producto **sin movimientos**; su SKU queda libre. Con historial responde `409` y el producto se retira con `PATCH /products/:id/status`. El borrado bloquea la misma fila que los movimientos: si coincide con una entrada, o se elimina el producto y el movimiento recibe `404`, o se registra el movimiento y el borrado recibe `409`.

Ejemplo PowerShell después del recorrido de autenticación (`$base` y `$headers` siguen definidos con una sesión admin vigente):

```powershell
$p = Invoke-RestMethod -Method Post "$base/products" -Headers $headers -ContentType 'application/json' -Body (@{ sku = 'INV-100'; name = 'Cable HDMI'; description = 'Dos metros' } | ConvertTo-Json)
Invoke-RestMethod "$base/products?search=cable&active=true" -Headers $headers
Invoke-RestMethod "$base/products/$($p.id)" -Headers $headers
Invoke-RestMethod -Method Patch "$base/products/$($p.id)" -Headers $headers -ContentType 'application/json' -Body (@{ name = 'Cable HDMI 2 m' } | ConvertTo-Json)
Invoke-RestMethod -Method Patch "$base/products/$($p.id)/status" -Headers $headers -ContentType 'application/json' -Body (@{ active = $false } | ConvertTo-Json)
```

El incremento 6 no necesita migración ni dependencias nuevas: reutiliza la tabla `products` y sus restricciones de la migración inicial.

## Pruebas y verificaciones

| Comando                               | Función                                                      |
| ------------------------------------- | ------------------------------------------------------------ |
| `npm run format:check`                | Comprueba formato sin editar                                 |
| `npm run lint`                        | Comprueba reglas de TypeScript sin editar                    |
| `npm run typecheck`                   | Verifica tipos de aplicación y pruebas                       |
| `npm run build`                       | Compila la aplicación a `dist/`, sin controladores de prueba |
| `npm test`                            | Unidades Jest de configuración, credenciales y hash          |
| `npm run test:e2e`                    | HTTP Supertest y persistencia/seed con PostgreSQL real       |
| `npm run test:cov`                    | Unidades e integración con cobertura mínima del 80%          |
| `npm run format` / `npm run lint:fix` | Corrección manual de formato / lint                          |
| `npm run db:test:up`                  | Arranca PostgreSQL independiente para pruebas                |

Antes de las pruebas HTTP o de cobertura:

```bash
npm run db:test:up
npm run test:cov
```

La base de pruebas por defecto es `inventory_test`, con usuario `inventory_test`, puerto `5434` y contraseña local de demostración `inventory_test_local`. El servicio `postgres-test` tiene almacenamiento temporal e independiente del volumen de desarrollo. Las suites de persistencia crean un esquema aleatorio exclusivo, aplican migraciones y eliminan solo ese esquema al terminar.

Las pruebas ignoran `.env` y no heredan `DB_*` de desarrollo. Para otro servidor se definen `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_NAME`, `TEST_DB_USERNAME` y `TEST_DB_PASSWORD` en el proceso. `TEST_DB_NAME` debe terminar en `_test`. Por ejemplo, en PowerShell: `$env:TEST_DB_PORT = '5435'`; en Bash: `export TEST_DB_PORT=5435`. Usa esos mismos valores al levantar el servicio y al ejecutar las pruebas.

La cobertura incluye todos los archivos de src salvo tests y se exige en líneas, sentencias, funciones y ramas. El reporte se escribe en coverage/; se puede consultar coverage/lcov-report/index.html y coverage/coverage-summary.json. La auditoría de main del 2026-10-13 incluye las 55 fuentes actuales; los tests verifican el contrato JWT-only del alcance acordado.

Las pruebas HTTP cierran sus servidores al terminar y usan puertos efímeros para verificar el listener. El controlador de validación existe únicamente en `test/` y no se distribuye con la API.

Los scripts habilitan las VM de módulos de Node para cargar las dependencias ESM de NestJS 12 y desactivan Watchman por CLI. Haste sigue los enlaces para archivos sincronizados por OneDrive; no hacen falta flags adicionales. Main 635e928 auditada el 2026-10-13: **554 pruebas en 22 suites**, **99,05% de cobertura de líneas** y las cuatro métricas por encima de 80% sobre 55 fuentes. Colección repetida con Newman en API/base descartables: **265 peticiones y 619 aserciones sin fallos**. Evidencia y límites en [la auditoría](docs/audits/2026-10-13-main.md).

## Integración continua

[El workflow de CI](.github/workflows/ci.yml) se ejecuta en GitHub Actions ante push o pull request: instala desde lockfile en Node 24, levanta un servicio PostgreSQL de pruebas, revisa formato, lint y tipos, compila y ejecuta pruebas con cobertura. Conserva el reporte como artefacto. En un push a `main`, si todo lo anterior pasa, el job `deploy` publica la API en Railway y ejecuta un smoke test; en ramas y pull requests nunca despliega.

## Despliegue (Railway)

La API se despliega en Railway con PostgreSQL gestionado; el diseño completo está en [la especificación 010](specs/010-deployment/spec.md) y la configuración del panel en [su plan](specs/010-deployment/plan.md).

| Paso                  | Qué ocurre                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Push o PR a otra rama | Solo `verify` (formato, lint, tipos, build y pruebas con cobertura ≥80%)                       |
| Push a `main`         | `verify` → `deploy` (`railway up`) → smoke test. Si `verify` falla, no se despliega            |
| En Railway            | Build `npm run build`, migraciones como pre-deploy, arranque `npm run start:prod`, healthcheck |
| Seed                  | Manual y una sola vez, con contraseñas de producción propias; el pipeline nunca lo ejecuta     |

En GitHub se requieren el secreto `RAILWAY_TOKEN` (project token del entorno `production`) y las variables `RAILWAY_SERVICE` y `API_URL`. Ningún secreto de la API ni de la base vive en el repositorio.

- API pública: [api-production-5341.up.railway.app](https://api-production-5341.up.railway.app).
- [Swagger](https://api-production-5341.up.railway.app/api/v1/docs) y [OpenAPI JSON](https://api-production-5341.up.railway.app/api/v1/docs-json).
- [CI/deploy/smoke de main `635e928`](https://github.com/damaral2005/Taller-Backend-NestJS/actions/runs/38324403873): verify y deploy exitosos. Comprobación pública del 2026-10-13: health/readiness/docs 200, products sin JWT 401 y 19 operaciones documentadas.

## Estructura actual

```text
src/
  config/environment.ts   # Validación de configuración
  config/runtime-environment.ts # Configuración HTTP y PostgreSQL
  database/               # Conexión, comandos y migración inicial
  common/                 # Paginación, errores de BD y esquemas OpenAPI
  users/                  # Entidad, administración y roles
  products/               # Entidad, catálogo (controlador, DTOs, servicio) y stock
  movements/entities/     # Historial con usuario y producto
  seed/                   # Credenciales, hash y carga transaccional
  auth/                   # Login, JWT, sesiones y guards
  health/                 # Salud del proceso y readiness de PostgreSQL
  app.module.ts           # Configuración global y módulos
  configure-app.ts        # Prefijo, pipe, Swagger y hooks compartidos
  swagger.ts              # Documento OpenAPI y Swagger UI en /api/v1/docs
  bootstrap.ts            # Creación y arranque del servidor
  main.ts                 # Punto de entrada del proceso
test/                     # Unidades e integración HTTP/PostgreSQL
postman/                  # Colección Postman de la API
specs/                    # Especificaciones, planes y tareas versionadas
docs/                     # Decisiones y overview por commit
.github/workflows/ci.yml   # Checks automatizados
```

Cada incremento nuevo empieza por su propia especificación antes del código. Consulta la [guía del grupo](docs/CONTRIBUTING.md) para preparar tu incremento.

## Cierre de entrega

Código, README, colección Postman autocontenida, pruebas/CI, API y Swagger desplegados están disponibles. El usuario confirma informe terminado y pruebas Postman exitosas en localhost y producción; el archivo/enlace del informe se compartirá después para revisión. Confirmar que incluye endpoints, parámetros, respuestas, arquitectura, resultados de pruebas y ambas URLs, y adjuntarlo en Intu. Mantener la API accesible durante la evaluación. Ver auditoría para evidencia y límites.
