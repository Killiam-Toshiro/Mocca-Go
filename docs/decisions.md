# Registro de decisiones

| ID   | Decisión                                                                              | Estado                                           | Motivo                                                                                                  |
| ---- | ------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| D-01 | Desarrollar en `Taller Backend – NestJS`; usar `2026-2-nestjs-postgres` como ejemplo. | Confirmada por contexto del usuario e inspección | La primera está vacía y la segunda contiene el ejemplo del curso.                                       |
| D-02 | Trabajar con `https://github.com/damaral2005/Taller-Backend-NestJS.git`.              | Confirmada por usuario                           | Es el repositorio de la entrega; inicialmente vacío.                                                    |
| D-03 | Elegir inventario y Spec-Driven Design con archivos versionados.                      | Confirmada por usuario                           | Respuesta del 2026-10-06; no se requiere instalar Spec Kit.                                             |
| D-04 | Cerrar y revisar un commit antes de implementar el siguiente.                         | Confirmada por usuario                           | Permite revisar cambios y mantener SDD actualizado.                                                     |
| D-05 | Productos, saldo y movimientos en un inventario; cantidades enteras.                  | Alcance inicial aceptado al avanzar              | Usuario autorizó el commit 2 tras el overview, sin cambios de alcance.                                  |
| D-06 | Roles `admin` y `operador`, usuarios creados por admin.                               | Alcance inicial aceptado al avanzar              | Cubre administración de roles y permisos distintos sin registro público.                                |
| D-07 | TOTP como 2FA y sesiones persistidas para revocar JWT.                                | TOTP reemplazado por D-37; sesiones vigentes     | Cumple dos factores y logout verificable en el servidor.                                                |
| D-08 | PostgreSQL, TypeORM, migraciones y seed por script idempotente.                       | Plan técnico inicial                             | Satisface persistencia y evita una ruta pública de carga de datos.                                      |
| D-09 | Primeros commits: SDD, base NestJS, persistencia/seed.                                | Segundo commit autorizado                        | Cada cambio se puede validar por separado; seguridad y dominio siguen después.                          |
| D-10 | Node 24, npm 11 y TypeScript estricto con CommonJS.                                   | Resuelta para commit 2                           | Coincide con el runtime local y permite usar Jest según la rúbrica.                                     |
| D-11 | NestJS 12.1.2, Config 12.0.1, TypeScript 5.9.3, Jest 30.5.2 y ts-jest 29.4.14.        | Metadata y peer dependencies verificadas en npm  | Las versiones exactas se fijan en package.json y el lockfile. TypeORM se verifica en el commit 3.       |
| D-12 | Health solo comprueba el proceso HTTP; prefijo `/api/v1`.                             | Implementación del commit 2                      | Evita declarar disponibilidad de una base de datos aún no conectada.                                    |
| D-13 | Cobertura conjunta de unidades y HTTP, sin excluir archivos de arranque ni módulos.   | Configurada para commit 2                        | El umbral del 80% aplica a las cuatro métricas; las nuevas funcionalidades también se incluirán.        |
| D-14 | ESLint 10.12.0 y @eslint/js 10.0.1 con typescript-eslint 8.71.1.                      | Compatibilidad verificada en npm                 | ESLint 9 ya no tiene soporte; las versiones elegidas aceptan Node 24 y el analizador soporta ESLint 10. |

## Pendientes y momento de resolución

Decisiones del commit 3:

- D-15: `@nestjs/typeorm` 12.0.2, TypeORM 1.1.1 y `pg` 8.23.1, con compatibilidad verificada en npm y versiones exactas en el lockfile.
- D-16: PostgreSQL 16.15-alpine; desarrollo en 5433 con volumen y pruebas en 5434 con almacenamiento temporal, publicados solo en localhost.
- D-17: saldo almacenado, movimientos con FK `RESTRICT`, username/SKU canónicos y restricciones en la migración. No hay sincronización automática de esquema.
- D-18: seed en una transacción con bloqueo asesor, claves estables y preservación de datos existentes. Hash scrypt de Node con `N=32768, r=8, p=3` y salt aleatoria.
- D-19: cada suite de PostgreSQL crea y elimina solo un esquema propio dentro de una base con sufijo `_test`. La configuración de test no hereda la conexión de desarrollo.

El código propio se compila a CommonJS; NestJS 12 distribuye dependencias ESM. Los scripts de pruebas habilitan las VM de módulos de Node para que Jest pueda cargarlas, según su documentación oficial. No se simula Nest ni se excluyen estas pruebas para resolver la compatibilidad.

| ID   | Decisión pendiente                                                                                                     | Resolver antes de                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| P-04 | Rotación de claves y recuperación de contraseña como mantenimiento opcional; recuperación 2FA fuera de alcance (D-65). | Ampliar mantenimiento                    |
| P-05 | Campos exactos de DTOs, paginación y formato uniforme de errores.                                                      | Implementar cada ruta                    |
| P-06 | Integrantes y autoría de contribuciones reales.                                                                        | Revisar participación y preparar entrega |
| P-07 | Resuelta en 010 (D-51 a D-58): Railway, PostgreSQL gestionado, secretos en Railway/GitHub y migraciones pre-deploy.    | Cerrada                                  |

El ejemplo puede orientar la estructura modular y los DTOs; no demuestra cumplimiento de JWT, 2FA, roles, cobertura ni despliegue. No se reutilizan passwords, secretos o datos personales de otros entornos.

Decisiones del commit 4:

- D-20: `@nestjs/jwt` 12.0.2, OTPAuth 9.5.2 y Throttler 6.7.1, compatibles y fijados. JWT HS256 con issuer/audience y sesión de 15 minutos, sin refresh.
- D-21: TOTP SHA1/6 dígitos/30 segundos y ventana ±1; cifrado AES-256-GCM con clave separada, AAD por propósito/usuario y contador persistido sin replay.
- D-22: enrolamiento inicial emitido por script privado, 15 minutos; desafío 5 minutos. Tokens aleatorios de 32 bytes guardados como digest; bloqueos transaccionales serializan verificación y consumo.
- D-23: cinco fallos de contraseña o TOTP por cuenta bloquean el factor 15 minutos. Las pruebas limitadas también tienen cinco intentos; solicitar desafíos nuevos no evita el bloqueo TOTP. Throttler limita IP/ruta a 20/minuto por proceso; almacenamiento compartido se resolverá para múltiples réplicas.
- D-24: autenticación completa y guards reutilizables en 004; administración, recuperación 2FA y dominio en siguientes incrementos. El usuario autorizó publicación de los cuatro commits.
- D-25: se añade `docs/CONTRIBUTING.md` para coordinar responsables, contratos, pruebas, overview y revisión por incremento con el grupo.

Decisiones del commit 5:

- D-26: tres rutas administrativas exclusivas para admin: crear/listar usuarios y cambiar rol. Username canónico, roles explícitos, paginación 1–10000/1–100 y proyección de identidad/fechas sin secretos.
- D-27: usuario y credencial limitada se crean en una sola transacción reutilizando el emisor de enrolamiento; no hay registro público, acceso sin 2FA, dependencias nuevas ni cambios de esquema.
- D-28: no degradar último admin registrado ni único admin con TOTP activo. Un admin pendiente no permite perder al último admin capaz de autenticarse. Rol idéntico no cambia timestamps; cambios conservan hash/factor/historial.
- D-29: escrituras administrativas serializadas con bloqueo asesor transaccional `(721005,1)`; listado con variante compartida. Revalidar actor/sesión después del bloqueo y bloquear después la fila destino. Así se protege la política entre instancias y peticiones en espera.
- D-30: mantener todas las suites/fuentes con detección de enlaces de Jest para archivos sincronizados por OneDrive; Watchman desactivado. Nuevos tests HTTP mantienen un listener efímero durante cada caso y verifican esperas reales con pg_locks.

Decisiones del commit 6:

- D-31: catálogo con cinco rutas en `/products`. Lectura para cualquier usuario autenticado; creación, edición y cambio de estado solo para admin, declarado por ruta con `Roles`. Sin migración ni dependencias nuevas: la tabla `products` y sus restricciones ya existen.
- D-32: SKU canónico sin transformación automática, con la misma expresión que el CHECK `products_sku_format` (`^[A-Z0-9][A-Z0-9._-]{0,47}$`, 1–48 caracteres) e inmutable. Nombre de 1–120 caracteres con algún carácter visible. Descripción de 1–500 caracteres: el límite es de la API, porque la columna es `text`. Se rechaza el carácter NUL con `400` en lugar de dejar que PostgreSQL produzca un `500`.
- D-33: la unicidad del SKU la garantiza PostgreSQL. Solo la violación de `products_sku_key` se convierte en `409` sin detalles de SQL; cualquier otro error se propaga sin enmascararse.
- D-34: editar y cambiar estado ocurren en una transacción que bloquea la fila del producto, compara y escribe únicamente las columnas de catálogo que cambian. Nunca se escribe `stock` (RN-02) y, si no hay diferencias, no se ejecuta el UPDATE, de modo que `updatedAt` no cambia. Un saldo confirmado por otra transacción no se pisa.
- D-35: la paginación pasa a `src/common/pagination.ts` y se comparte con usuarios sin cambiar su contrato. El listado ordena por SKU e ID, incluye inactivos salvo `active=true`, y `search` usa `ILIKE` sobre SKU y nombre con `%`, `_` y `\` escapados.
- D-36: el spec se renombró a `specs/006-catalog`. Rechazar movimientos sobre productos inactivos (RN-05) y escribir `stock` se resuelven en el incremento de movimientos.

Decisiones del commit 7:

- D-37: se retira el segundo factor (TOTP) por decisión del grupo; autenticación con usuario y contraseña que producen un JWT. El enunciado original sí incluía 2FA; el usuario ratifica su exclusión del alcance vigente el 2026-10-13 (D-65). Reemplaza D-07, D-21, D-22 y la parte TOTP de D-23, D-27 y D-28 en el comportamiento implementado. Scrypt, bloqueo, límite por IP y sesiones revocables se conservan.
- D-38: se conservan las sesiones en PostgreSQL (el JWT lleva `sub` y `sid`) para que `logout` revoque el token, y el bloqueo de cuenta de 5 fallos / 15 minutos con el límite de 20 peticiones por minuto por IP.
- D-39: `POST /users` devuelve el usuario seguro sin credencial de enrolamiento; la regla de último admin queda solo en «último admin registrado». `auth:enroll`, `otpauth`, el cifrado AES-256-GCM y `TOTP_ENCRYPTION_KEY` desaparecen; un `.env` antiguo con esa variable se ignora.
- D-40: migración incremental `1791244802000` que elimina las columnas TOTP y `auth_proofs`, sin editar las anteriores. Es destructiva: `down()` restaura la estructura vacía, no los secretos.

Decisiones del commit 8:

- D-41: corregir imports conforme a las subcarpetas ya versionadas (`DTOs`, `controller`, `module`, `services`) y entidad `products.entity.ts`; conservar contratos y esquema. Restaurar `.env.example`, completar trazabilidad y sustituir resultados no reproducidos por mediciones locales de esta versión. Usuario autoriza commit y push de corrección a `feature-products` el 2026-10-08.

Decisiones del incremento 008 (movimientos, renumerado tras retiro de 2FA):

- D-42: rama `codex/feature-movements` desde catálogo verificado `815c649`. El usuario confirma el recorrido manual de 006 y autoriza el siguiente commit/push. Integración en main requiere revisar catálogo y movimientos; este incremento no hace merge.
- D-43: admin/operador registran y consultan movimientos. Responsable desde sesión; proyección `{id,productId,type,quantity,reason,user:{id,username},createdAt}` y POST `{movement,stock}`. Sin claves de seed, hashes ni secretos; respuestas no-store.
- D-44: cantidad y saldo limitados al integer de PostgreSQL (2147483647), overflow y saldo insuficiente → 409. Producto inactivo → 409; UUID existente como filtro sin registros → lista vacía. Motivo obligatorio de 1–300 caracteres visibles, sin NUL.
- D-45: creación con transacción, bloqueo de fila, sesión revalidada después de esperar, update exclusivo de stock e insert auditado; rollback conjunto. Comparte bloqueo con catálogo/desactivación. Historial con filtros y lectura REPEATABLE READ para conteo/página consistente.
- D-46: POST no es idempotente ni admite edición/eliminación de movimientos. Repetirlo válido registra otro movimiento; confirmar historial antes de reintentar respuesta incierta. No hay migración ni dependencias nuevas; Postman queda para el próximo incremento.

Decisiones del incremento 009:

- D-47: `@nestjs/swagger` 12.0.2 con versión exacta; peer dependencies compatibles con NestJS 12.1.2, TypeScript 5.9.3, class-validator y class-transformer. Es la única dependencia nueva y no hay migración.
- D-48: Swagger UI en `/api/v1/docs` y OpenAPI JSON en `/api/v1/docs-json`, públicos y activos en todos los entornos, incluida producción, para que el docente y el grupo consulten la API desplegada. Solo exponen contratos; las rutas siguen protegidas por sus guards y Swagger no concede acceso.
- D-49: decoradores explícitos (`@ApiProperty`, `@ApiOperation`, `@ApiResponse`) en lugar del plugin del CLI: documentan patrones, longitudes y rangos que el plugin no deduce y no cambian la compilación de Jest. Cuando existe una constante de validación (SKU, cantidad máxima) se reutiliza.
- D-50: esquemas de respuesta como clases solo de documentación (`*.responses.ts`), sin modificar las proyecciones `*.view.ts`; error común `{statusCode,message,error}`. Una prueba e2e compara la lista exacta de operaciones para que una ruta nueva sin documentar haga fallar la suite.

Decisiones del incremento 010 (aprobadas por el usuario el 2026-10-12):

- D-51: Railway, un proyecto con servicios `api` y `Postgres` (gestionado) en un único entorno `production`. Plan Trial/Free con crédito limitado: no se presenta como gratuito y la URL debe verificarse durante la evaluación.
- D-52: despliega GitHub Actions. Job `deploy` con `needs: verify`, solo en push a `main`, con `@railway/cli` 5.63.1 fijada y un project token (`RAILWAY_TOKEN`). El autodeploy de Railway desde GitHub queda desactivado. En `main` no se cancelan ejecuciones en curso para no cortar un despliegue.
- D-53: la configuración del servicio (build, pre-deploy, start, healthcheck, réplicas) se fija en el panel de Railway y se documenta en el plan 010; Railway ya no admite `railway.json` en servicios nuevos.
- D-54: migraciones como pre-deploy con `node dist/database/migrate.js run`, sobre el build compilado; si fallan, la versión nueva no se activa. Nunca se ejecuta `migration:revert` en producción.
- D-55: seed manual una sola vez con contraseñas de producción propias que no se guardan en el repositorio ni en GitHub; el pipeline no ejecuta seed.
- D-56: `TRUST_PROXY_HOPS` (0–10, por defecto 0) aplica `trust proxy` de Express para que el límite de 20/min use la IP real detrás del proxy de Railway (valor 1). Con 0 se ignora `X-Forwarded-For` y nadie puede falsear su IP.
- D-57: `JWT_SECRET` de producción nuevo y exclusivo de Railway. `.env.example` ya no incluye claves con apariencia real ni `TOTP_ENCRYPTION_KEY`; el valor que estuvo versionado se considera público.
- D-58: una réplica (limitador en memoria, D-23), Swagger público en producción (D-48) y conexión a PostgreSQL por la red privada de Railway con `DB_SSL=false`.

Decisiones del incremento 011 (aprobadas por el usuario el 2026-10-12, tras contrastar la spec con el código):

- D-59: eliminación física de productos y usuarios solo cuando no tienen movimientos; con historial se responde `409` (RN-08, RN-10). Reemplaza el «fuera de alcance» de 006; el historial sigue siendo inmutable (RN-03). Sin migración ni dependencias nuevas.
- D-60: en `DELETE /users/:id` se evalúa primero «último admin» y después «auto-eliminación». El actor siempre es un admin revalidado, así que con el orden inverso la regla de último admin sería inalcanzable. Las sesiones del usuario eliminado caen por la FK `sessions.user_id ON DELETE CASCADE` existente.
- D-61: un admin puede cambiar `username` y `password` de cualquier usuario con `PATCH /users/:id`. Cambiar la contraseña revoca las demás sesiones del destino (se conserva la que hace la petición) y reinicia su contador y bloqueo de intentos. Reemplaza parcialmente el «fuera de alcance» de 007: sigue sin haber cambio por el propio usuario ni recuperación. El rol solo cambia con `PATCH /users/:id/role`.
- D-62: `MovementsService` traduce la violación de `stock_movements_user_id_fkey` a `401`, para que eliminar un usuario mientras registra un movimiento no produzca `500`.
- D-63: `GET /health/ready` ejecuta `SELECT 1` con límite de 2 s y responde `503` genérico si falla. Railway y el smoke test siguen usando `GET /health`, que no consulta la base (D-12).
- D-64: Swagger pasa de 14 a 19 operaciones y `ErrorStatus` admite `503`. Reemplaza el conteo del criterio S-02 de 009.

Decisión de alcance posterior a la auditoría (2026-10-13):

- D-65: el usuario excluye explícitamente 2FA de los requisitos de aquí en adelante y autoriza commit/push de documentación a main. R-02 vigente exige login con usuario/contraseña, JWT, logout revocable y rutas protegidas; se verifica con las pruebas existentes. No se planifica restaurar 2FA. Se conserva el enunciado original como antecedente, sin atribuir esta modificación al docente. El informe está terminado según usuario y pendiente de compartir para revisión.
