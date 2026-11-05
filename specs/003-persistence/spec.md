# Especificación 003 — PostgreSQL, migraciones y seed

Fecha: 2026-10-06. Incremento: commit 3. El usuario autorizó avanzar después del overview del commit 2.

## Alcance y configuración

Conectar la aplicación NestJS a PostgreSQL mediante TypeORM, crear una migración inicial y un script de seed. No se añaden rutas de inventario ni de autenticación todavía. Health mantiene el contrato del incremento 002 y solo informa disponibilidad del proceso HTTP.

PostgreSQL local se ejecuta con Docker Compose usando `postgres:16.15-alpine`. Desarrollo tiene un volumen persistente; pruebas usan un servicio y una base independientes, con almacenamiento temporal. Los puertos se publican únicamente en `127.0.0.1`.

| Variable de aplicación | Valor inicial / regla                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`, `PORT`     | Se conservan las reglas del incremento 002.                                                              |
| `DB_HOST`              | `127.0.0.1`, texto no vacío.                                                                             |
| `DB_PORT`              | `5433`, entero entre 1 y 65535, solo dígitos.                                                            |
| `DB_NAME`              | `inventory`, identificador de letras minúsculas, dígitos y guion bajo. En test debe terminar en `_test`. |
| `DB_USERNAME`          | `inventory`, texto no vacío.                                                                             |
| `DB_PASSWORD`          | Obligatoria y no vacía; sin valor por defecto en el código.                                              |
| `DB_SCHEMA`            | `public`, identificador de letras minúsculas, dígitos y guion bajo.                                      |
| `DB_SSL`               | `false`; solo `true` o `false`. Con `true` se valida el certificado.                                     |

Los identificadores comienzan con una letra y tienen como máximo 63 caracteres. Los errores de configuración indican la variable, sin mostrar sus valores. `.env.example` contiene únicamente valores de demostración local; no son credenciales para producción.

Las pruebas toman `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_NAME`, `TEST_DB_USERNAME` y `TEST_DB_PASSWORD`, con valores locales para el servicio de pruebas, y los mapean a `DB_*`. No heredan la conexión de desarrollo ni cargan `.env`. Antes de cualquier limpieza se verifica `NODE_ENV=test`, nombre de base con sufijo `_test` y nombre del esquema creado por la propia suite. Nunca se truncan ni eliminan tablas de desarrollo.

## Esquema inicial

| Tabla             | Campos y restricciones                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`           | UUID generado, username único normalizado a minúsculas (3–64 caracteres ASCII: letras, dígitos, punto, guion y guion bajo), hash de contraseña, rol `admin` o `operador`, fechas. El hash no se selecciona por defecto. |
| `products`        | UUID generado, SKU único normalizado a mayúsculas (1–48 caracteres ASCII), nombre no vacío de hasta 120 caracteres, descripción nullable, activo, stock entero no negativo, fechas.                                     |
| `stock_movements` | UUID generado, producto y usuario mediante FK con `RESTRICT`, tipo `IN` o `OUT`, cantidad entera positiva, motivo no vacío de hasta 300 caracteres, fecha, clave de seed nullable y única. Índice por producto/fecha.   |

No hay borrado en cascada del historial. PostgreSQL genera UUIDs mediante `gen_random_uuid()`; no se instala una extensión ni se utiliza `synchronize` para crear el esquema.

La base exige valores canónicos de username/SKU y rechaza una forma inválida; este incremento no transforma entradas HTTP, porque sus DTOs y rutas se implementarán después.

El saldo se almacena en `products.stock`. Para el seed, la entrada y el aumento de stock se guardan en la misma transacción. El servicio de movimientos posterior reutilizará esta estrategia y añadirá las validaciones de salidas y concurrencia de las rutas HTTP. Una consulta o edición del catálogo no puede cambiar el saldo como parte del contrato futuro.

## Migraciones y ciclo de vida

- `synchronize=false`, `dropSchema=false` y `migrationsRun=false`.
- `npm run migration:run` compila y aplica migraciones pendientes. Repetirlo no vuelve a ejecutar la migración ya registrada.
- `npm run migration:revert` revierte la última migración; es una operación explícita que elimina las tablas iniciales y sus datos. Se documenta para bases descartables, no se ejecuta sobre desarrollo en las verificaciones.
- Las migraciones operan sobre el esquema configurado, con identificadores correctamente escapados. TypeORM mantiene su tabla de historial de migraciones.
- Nest registra la conexión y la cierra al cerrar la aplicación. Los comandos de migración y seed cierran la conexión incluso si falla la operación.
- El cargador de los comandos conserva las variables adicionales de `.env`, incluidas las contraseñas de seed, al validar la conexión. Las variables existentes del proceso mantienen precedencia.
- El arranque no ejecuta seed ni migraciones automáticamente. Una base inaccesible impide arrancar; se limita el tiempo de conexión y no se hacen reintentos indefinidos.

## Seed previsto

`npm run seed` compila y carga datos en una base ya migrada. Requiere `SEED_ADMIN_PASSWORD` y `SEED_OPERATOR_PASSWORD`, de 12 a 128 caracteres, suministradas por entorno. No imprime contraseñas ni hashes.

- Usuarios iniciales: `admin` con rol `admin`, `operador` con rol `operador`.
- Tres productos de demostración: `INV-001` (Teclado, entrada 20), `INV-002` (Mouse, entrada 30), `INV-003` (Monitor, entrada 10).
- Una entrada inicial por producto, asociada al admin y a una clave de seed estable (`inventory-v1:INV-001`, etc.).
- Una única transacción abarca usuarios, catálogo, stock y movimientos. Un bloqueo asesor transaccional serializa ejecuciones simultáneas del seed.
- Si el username ya existe, se conserva su contraseña y rol. Si el SKU ya existe, se conservan nombre, descripción, estado y saldo previo.
- La clave de seed se comprueba antes de aumentar stock; un movimiento ya cargado no se aplica otra vez. Si falta esa entrada y el producto existente está inactivo, el seed falla y revierte todo, sin reactivarlo silenciosamente.
- Los nuevos productos comienzan en stock cero y su entrada inicial actualiza el saldo con bloqueo de fila dentro de la transacción.
- No se utiliza `deleteAll`, `truncate`, reemplazo de tablas ni reset de contraseñas. Los cambios de negocio posteriores y el historial se conservan al repetir el seed.
- Hash con scrypt asíncrono de Node, salt aleatoria por usuario y parámetros versionados en el hash. La política inicial usa `N=32768`, `r=8`, `p=3`, clave de 64 bytes y memoria máxima de 64 MiB.

La existencia de usuarios no habilita login sin 2FA. No se crea una ruta pública de seed ni un atajo de autenticación; enrolamiento, JWT y logout se implementan después.

## Criterios de aceptación

- P-01: Docker Compose valida su configuración y levanta servicios independientes de desarrollo y pruebas; el almacenamiento de desarrollo persiste.
- P-02: configuración inválida falla antes de conectar y nunca expone secretos; opciones ORM desactivan sincronización, borrado y migración automática.
- P-03: la migración crea el esquema desde cero en PostgreSQL real, una segunda ejecución no lo duplica y su reversión se prueba solo en un esquema descartable.
- P-04: repositorios TypeORM guardan y recuperan usuarios, productos y movimientos; datos se conservan al cerrar y reabrir la conexión.
- P-05: se verifican unicidad, normalización, roles, cantidad/stock, FK y prohibición de borrado en cascada en PostgreSQL.
- P-06: seed en base vacía genera dos usuarios, tres productos, tres entradas y saldos 20/30/10; no almacena contraseña en claro ni la devuelve por defecto.
- P-07: repetir el seed y ejecutar dos seeds simultáneos no duplica datos ni aplica saldos otra vez; se preservan cambios posteriores de usuarios/catálogo e historial.
- P-08: un fallo del seed revierte usuarios, catálogo, movimiento y saldo; también se prueba rollback de una transacción que cambia saldo y falla al insertar un movimiento.
- P-09: Jest, Supertest y persistencia se ejecutan con PostgreSQL real, sin SQLite ni mocks del ORM; cobertura global mínima del 80% en las cuatro métricas incluyendo migraciones y scripts.
- P-10: CI usa un servicio PostgreSQL y ejecuta la cobertura; README, decisiones, tareas y overview registran instrucciones y resultados reales.

Los escenarios de stock negativo por salidas HTTP concurrentes y permisos por ruta siguen pendientes del incremento de movimientos/autenticación.
