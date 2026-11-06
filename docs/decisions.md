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

Decisiones del incremento 012 (Mocca Go; aprobadas por el usuario el 2026-11-05):

- D-66: el proyecto pasa a ser el backend de Mocca Go. Los incrementos 012 a 019 (fundaciones, clientes, catálogo y combos, zonas y puntos, pedidos con pago demo, órdenes de cocina, rondas, encuesta y métricas) siguen el flujo SDD y se detienen para revisión tras cada uno (D-04).
- D-67: cuatro roles — `admin`, `operador` (cocina), `repartidor` y `cliente`. Un admin solo asigna roles de personal (`admin`, `operador`, `repartidor`); `cliente` nace del registro propio (013) y no cambia de rol (`409`). Reemplaza RN-07.
- D-68: CORS por lista explícita de orígenes en `CORS_ORIGINS`, sin comodín ni credenciales; desactivado por defecto. El frontend Next.js usa el puerto 3001 en local.
- D-69: la vida del JWT es configurable con `ACCESS_TOKEN_TTL_SECONDS` (60–86400 s, por defecto 900); sigue sin haber refresh.
- D-69b: la base de desarrollo pasa a `mocca_go` (usuario `mocca_go`). `compose.yaml`, su volumen y la base efímera de pruebas `inventory_test` no cambian. Railway se vuelve a crear, sin datos que migrar.
- D-70: `issuer` y `audience` del JWT pasan a `mocca-go-api` y `mocca-go-client`; los JWT anteriores dejan de ser válidos.
- D-71: el seed añade `repartidor` con `SEED_COURIER_PASSWORD` obligatoria. El inventario de ejemplo se reemplaza en el incremento 014.
- D-72: `ConfigModule` valida el entorno al importar `AppModule`, por lo que las pruebas de duración del JWT sustituyen `ConfigService` con el entorno ya validado y la validación de `CORS_ORIGINS` y `ACCESS_TOKEN_TTL_SECONDS` se prueba de forma unitaria; el comportamiento real de arranque se comprobó además con la API compilada (ver overview 012).

Decisiones del incremento 013 (Clientes; aprobadas por el usuario el 2026-11-05):

- D-73: el cliente es un `users` con rol `cliente` más una fila 1 a 1 en `customers` (correo, nombre, teléfono). Login, sesiones, bloqueo por intentos y guards se reutilizan; el `username` del cliente es interno y generado.
- D-74: registro público `POST /customers`, limitado a 5 por minuto por IP, que no inicia sesión. El `409` por correo duplicado revela que el correo existe; se acepta en la demo.
- D-75: `POST /auth/login` acepta `email` (clientes) o `username` (personal), exactamente uno. Todos los fallos son un `401` idéntico.
- D-76: el teléfono es obligatorio, no único y se guarda en E.164; acepta celulares colombianos e internacionales. El envío de WhatsApp o SMS queda para un incremento posterior.
- D-77: `PATCH /auth/password` permite a cualquier rol cambiar su propia contraseña: verifica la actual con el contador de fallos del login, exige una nueva distinta y revoca las demás sesiones. Una contraseña actual incorrecta responde `403` para no confundirla con una sesión vencida. Complementa D-61.
- D-78: sin verificación de correo ni de teléfono; el origen de adquisición queda fuera de alcance.
- D-79: las respuestas de usuario (`GET /users`, `GET /users/:id`, `POST` y `PATCH /users/:id`, solo admin) añaden `email`, `fullName` y `phone`; son `null` en el personal. Los datos se leen de `customers` con una consulta aparte por página (sin relación nueva en la entidad `User`). Corrección pedida por el usuario tras probar el listado (2026-11-05).

Decisiones del incremento 014 (Catálogo y combos; aprobadas por el usuario el 2026-11-05):

- D-80: el menú vendible vive en `products`, ampliada con `category`, `price`, `cost` y `sold_out`; los combos son productos de categoría `combo` con filas en `product_components`. Un combo no tiene saldo propio (`CHECK category <> 'combo' OR stock = 0`); su saldo, costo y disponibilidad se calculan al leer.
- D-81: `available` y `costPercent` son calculados, nunca almacenados; `soldOut` es el interruptor manual de la cocina y es independiente de `active` (retirado del menú) y del saldo.
- D-82: seis categorías fijas (`cafe`, `bebida`, `panaderia`, `pasteleria`, `snack`, `combo`) en un CHECK; un producto no cambia entre simple y combo.
- D-83: `GET /products` pasa a ser solo `admin` y `operador` (datos internos: saldo y costo); el cliente lee `GET /menu`, público y `no-store`. Modifica el RN-15 de 012.
- D-84: el inventario de ejemplo del taller (teclado, mouse, monitor) se reemplaza por el menú de Mocca Go. Como el historial de movimientos es inmutable, la base de desarrollo se recrea en vez de borrar filas.
- D-85: las reglas entre filas (solo los combos tienen componentes, sin combos anidados, componentes activos) las verifica el servicio en una transacción con bloqueo de fila del combo; la FK `RESTRICT` del componente protege contra eliminaciones concurrentes.

Decisiones del incremento 015 (Zonas y puntos de entrega; aprobadas por el usuario el 2026-11-05):

- D-86: zonas y puntos son dos tablas (`delivery_zones`, `delivery_points`). La zona es solo de despacho y el cliente nunca la elige; se deduce del punto, que es lo que elegirá en el pedido (016).
- D-87: `floors` es un entero de 1 a 30 o `NULL` («sin pisos»); `hint` es texto opcional de hasta 200 caracteres. La validación del piso elegido en un pedido es de 016.
- D-88: la consulta pública (`GET /delivery-zones`, `no-store`, 60 peticiones por minuto por IP) y la de administración (`GET /delivery-zones/all`) son rutas separadas.
- D-89: los nombres de zonas y puntos son únicos sin distinguir mayúsculas mediante índices únicos sobre `lower(name)`; la unicidad la decide PostgreSQL y el servicio la traduce a `409`.
- D-90: las carreras entre crear o mover un punto y eliminar su zona se resuelven con bloqueo compartido de la zona al escribir un punto, bloqueo exclusivo al eliminarla y la FK `RESTRICT` como red de seguridad.
- D-91: el teléfono del personal y el aviso «en camino» (estado y hora estimada en la app, botón del repartidor que abre WhatsApp) se difieren a 016/017; el máximo de 5 pedidos por ronda y una zona por ronda se aplican en 018.

Decisiones del incremento 016 (Pedidos con pago de demostración; aprobadas por el usuario el 2026-11-05):

- D-92: el inventario sigue teniendo una sola fuente de verdad, el historial de movimientos. El pedido no calcula saldos por su cuenta: llama al núcleo de `MovementsService` dentro de su transacción.
- D-93: el saldo baja al aprobarse el pago, dentro de la misma transacción que crea el pedido; cancelar lo devuelve con movimientos `IN`.
- D-94: los pagos son simulados con dos tarjetas de prueba (una aprueba y otra rechaza); el número completo se valida en memoria y nunca se persiste ni se registra. Un rechazo es `402` y no deja rastro.
- D-95: `Idempotency-Key` obligatorio y huella del contenido guardada con el pedido; la unicidad `(customer_id, idempotency_key)` la decide PostgreSQL.
- D-96: el pedido guarda copias (nombres, precios, costos, punto y zona, componentes de combos) para que el historial no cambie cuando cambie el menú.
- D-97: los estados se modelan como CHECK y una tabla de eventos; 017 y 018 solo agregan transiciones.
- D-98: el costo de las líneas es dato interno: se guarda pero no se devuelve en ninguna respuesta de pedidos.

Decisiones del incremento 017 (Órdenes de cocina y notificaciones en tiempo real; aprobadas por el usuario el 2026-11-05):

- D-99: los cambios de estado se avisan por **push** y no por consulta repetida; el estado sigue guardándose en la base y el aviso es solo una ayuda para no consultar.
- D-100: el canal es SSE sobre HTTP normal (mismo `Bearer`, mismos guardas), no WebSocket, porque el flujo es solo del servidor al navegador. El frontend lo lee con `fetch` en flujo, ya que `EventSource` no envía `Authorization`.
- D-101: la difusión entre instancias usa `LISTEN/NOTIFY` de PostgreSQL y el aviso se emite con `pg_notify` dentro de la transacción del cambio, de modo que un rollback lo descarta. No se añade Redis.
- D-102: el aviso solo lleva número, estado, hora e id del pedido; el cliente solo recibe los de sus pedidos, la cocina todos. Al abrir el canal y tras cada reconexión de la escucha el servidor envía `ready` para que el frontend vuelva a consultar.
- D-103: transiciones solo hacia adelante (`recibido → en_preparacion → listo`) con bloqueo de la fila del pedido; sin asignación a un operador, solo se registra quién hizo cada cambio.
- D-104: un usuario tiene como máximo 5 canales abiertos y cada latido (25 s) verifica que su sesión siga vigente.

Decisiones del incremento 018 (Rondas de despacho y entrega; aprobadas por el usuario el 2026-11-05):

- D-105: el repartidor arma su propia ronda, con la sugerencia del sistema (zona del pedido `listo` más antiguo y hasta 5 de sus pedidos) o con una ruta propia de una sola zona; crear la ronda es salir (los pedidos pasan a `en_camino` al instante).
- D-106: máximo 5 pedidos por ronda y 2 rondas activas por repartidor (10 pedidos en reparto); la hora estimada de llegada es una constante de 15 minutos desde la salida.
- D-107: dos repartidores nunca toman el mismo pedido: la sugerencia usa `FOR UPDATE SKIP LOCKED`, la ruta propia bloquea por id, y el límite de rondas se verifica con la fila del repartidor bloqueada.
- D-108: el personal tiene `phone` y `fullName` en `users` (mismo formato E.164 que los clientes); son obligatorios para el rol `repartidor`. El cliente ve nombre, teléfono y enlace de WhatsApp del repartidor solo mientras su pedido está `en_camino`.
- D-109: `no_entregado` es un estado final con motivo obligatorio que no devuelve inventario ni reembolsa; su tratamiento se decide en un incremento posterior.
- D-110: la ronda se cierra sola cuando ningún pedido sigue `en_camino`; entregar bloquea primero el pedido y luego la ronda para evitar interbloqueos.
- D-111: el repartidor tiene su propio canal en tiempo real (`GET /dispatch/stream`) con los avisos de todos los pedidos; `admin` y `operador` consultan rondas pero no las modifican. Eliminar un usuario con historial de pedidos o rondas responde `409`.

Decisiones del incremento 019 (Encuesta de satisfacción y métricas; aprobadas por el usuario el 2026-11-05):

- D-112: la encuesta es una calificación de 1 a 5 con comentario opcional (hasta 300 caracteres); cada pedido `entregado` admite una sola respuesta, del cliente dueño, y no se edita ni se borra. La unicidad la garantiza la base (`UNIQUE(order_id)`) y el servicio bloquea el pedido.
- D-113: la respuesta se ve dentro del pedido (`survey`, `null` si no existe) para cliente, admin y operador; el admin además la lista en `GET /surveys` con filtros y paginación.
- D-114: las métricas son una sola ruta, `GET /metrics`, solo para el admin, con rango `from`/`to` (por defecto 30 días, máximo 366) y filtro opcional por zona; todas las secciones salen de una transacción `REPEATABLE READ`.
- D-115: una venta es un pedido con pago `aprobado` (incluye `no_entregado`; la cancelación reembolsa y deja de contar). El costo variable usa el costo guardado en cada línea del pedido, no el actual del producto.
- D-116: los tiempos salen de los eventos del pedido; «a tiempo» mide el reparto (`en_camino` → `entregado`) contra 15 minutos, y se reportan también cocina y espera.
- D-117: los días se cuentan en hora de Colombia (UTC−5 fijo). Las respuestas de `/metrics` y `/surveys` no se guardan en caché. Eliminar un cliente con encuestas responde `409`.
