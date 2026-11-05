# Plan 012 — Fundaciones de Mocca Go

Fecha: 2026-11-04. Una migración, tres variables de entorno nuevas y ninguna dependencia nueva. A revisar antes de escribir código.

## Decisiones propuestas (registrar en `docs/decisions.md` al aprobar)

- D-66: el proyecto pasa a ser el backend de Mocca Go; los incrementos 012 a 019 siguen el mismo flujo SDD (spec, plan, tareas, código, overview) y cada uno se detiene para revisión (D-04).
- D-67: cuatro roles — `admin`, `operador` (cocina), `repartidor`, `cliente`. `operador` se conserva como rol de cocina para no romper datos, seed ni pruebas. Un admin solo asigna roles de personal; `cliente` nace del registro propio (013) y no cambia de rol. Reemplaza RN-07.
- D-68: CORS por lista explícita de orígenes en `CORS_ORIGINS`, sin comodín y sin credenciales; por defecto desactivado. El frontend Next.js usa el puerto 3001 en local.
- D-69: la sesión sigue siendo un JWT de acceso sin refresh, pero su vida es configurable (`ACCESS_TOKEN_TTL_SECONDS`, 60–86400 s, por defecto 900). El refresh queda fuera de alcance.
- D-69b: la base de desarrollo pasa a llamarse `mocca_go` (usuario `mocca_go`). `compose.yaml` no se modifica: sus servicios, puertos, volumen `inventory_data` y la base efímera de pruebas `inventory_test` quedan igual. El despliegue en Railway se vuelve a crear con la configuración nueva, así que no hay datos remotos que migrar.
- D-70: `issuer` y `audience` del JWT pasan a `mocca-go-api` y `mocca-go-client`. Invalida los JWT vigentes; aceptable antes del piloto.
- D-71: el seed añade `repartidor` con `SEED_COURIER_PASSWORD` obligatoria. El inventario de ejemplo sigue igual hasta 014.

## Migración `1791244803000-mocca-roles`

- `up()`: `ALTER TABLE users DROP CONSTRAINT users_role_valid` y `ADD CONSTRAINT users_role_valid CHECK ("role" IN ('admin','operador','repartidor','cliente'))`. El default `operador` no cambia. Sigue el patrón de las migraciones existentes (esquema entrecomillado con `quoteIdentifier`).
- `down()`: si existe algún usuario con rol `repartidor` o `cliente`, lanza error sin modificar nada (revertir no debe borrar ni reclasificar cuentas); si no, restaura el CHECK de dos roles. Se documenta que se revierte solo en bases descartables.
- No se edita ninguna migración anterior.

## Roles

- `src/users/entities/user.entity.ts`: `UserRole` y `USER_ROLES` con los cuatro valores, nuevo `STAFF_ROLES = ['admin','operador','repartidor']`, y el `@Check` actualizado (debe coincidir con la migración).
- `src/users/users.dto.ts`: `CreateUserDto` y `ChangeRoleDto` validan con `@IsIn(STAFF_ROLES)` y documentan `enum: STAFF_ROLES`.
- `src/users/users.service.ts`: en `changeRole`, tras bloquear el destino y comprobar que existe, si `target.role === 'cliente'` → `ConflictException('Un cliente no cambia de rol.')` (constante nueva). El resto del orden de reglas no cambia.
- Respuestas (`users.responses.ts`, `auth.responses.ts`): ya usan `USER_ROLES`; solo cambia su contenido.
- Guards y controladores existentes: sin cambios (RN-15). Se añaden pruebas que fijan ese comportamiento.

## CORS

- `src/config/environment.ts`: `AppEnvironment` gana `CORS_ORIGINS: string[]`. Nuevo `parseCorsOrigins(value)`: vacío o ausente → `[]`; separa por comas **sin recortar entradas vacías en silencio** (una entrada vacía es error); cada entrada debe cumplir `new URL(origin).origin === origin` con protocolo `http:` o `https:`; rechaza `*`, rutas, `/` final y duplicados. Mensaje: `CORS_ORIGINS debe ser una lista de orígenes http(s) separados por comas.` sin eco del valor.
- `src/bootstrap.ts`: `createApplication` pasa `corsOrigins` a `configureApplication`.
- `src/configure-app.ts`: si la lista no está vacía, `app.enableCors({ origin: corsOrigins, methods: ['GET','POST','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Authorization','Content-Type'], credentials: false, maxAge: 600 })`. Debe registrarse **antes** del middleware `no-store` y del prefijo global para que los preflight no pasen por guards.
- `.env.example`: `CORS_ORIGINS=http://localhost:3001`.

## Duración del JWT

- `src/auth/auth.config.ts`: `ACCESS_SECONDS` deja de ser constante; `validateAuthEnvironment` devuelve también `ACCESS_TOKEN_TTL_SECONDS` (default 900, 60–86400, solo dígitos) y se mantiene `JWT_SECRET`.
- `src/auth/auth.module.ts` y `auth.service.ts`: leen el valor desde `ConfigService` (el módulo pasa a `JwtModule.registerAsync` si hoy usa `register`) y lo usan para `expiresIn`, `expiresAt` de la sesión y la respuesta de login.
- `src/config/runtime-environment.ts`: incluye las variables nuevas en la validación global para que el fallo ocurra al arrancar.
- `src/swagger.ts`: la descripción recibe el TTL real en minutos (se calcula al construir el documento).

## Identidad

- `package.json`: `name`, `description`. `package-lock.json` solo cambia el campo `name`; no se incluyen cambios ajenos.
- `src/auth/auth.config.ts`: `JWT_ISSUER`, `JWT_AUDIENCE`.
- `src/swagger.ts`: título y `customSiteTitle`.
- `README.md`: encabezado, estado y tabla de incrementos con 012 a 019 previstos; documentación de las tres variables nuevas.
- `src/database/database.config.ts`: los valores por defecto de `DB_NAME` y `DB_USERNAME` pasan de `inventory` a `mocca_go`.
- `.env.example`: `DB_NAME=mocca_go`, `DB_USERNAME=mocca_go`, `DB_PASSWORD=mocca_go_local_only`. El `.env` local de cada persona se actualiza a mano (no se versiona).
- `README.md`: tabla de variables con los nuevos valores por defecto.
- `test/unit/database-config.spec.ts`: valores de ejemplo y casos con `mocca_go`. `test/setup-env.ts` y `postgres-test` conservan `inventory_test` (base efímera en memoria); sigue cumpliendo la regla del sufijo `_test`.
- `compose.yaml`, volumen, puertos y scripts: sin cambios. Los valores de respaldo `${DB_NAME:-inventory}` del archivo solo se usan si falta la variable, y `.env.example` ya la define, así que no afectan.

### Recrear la base local (una sola vez)

PostgreSQL solo crea la base y el usuario cuando inicializa un volumen vacío. Si el volumen `inventory_data` ya existe (Compose usa el mismo nombre de proyecto que la carpeta anterior), seguirá teniendo `inventory`. Pasos con el `.env` ya actualizado:

1. `docker compose down -v` (borra los datos de desarrollo del volumen; hoy son solo datos de ejemplo).
2. `npm run db:up`, `npm run migration:run`, `npm run seed`.

## Seed

- `src/seed/credentials.ts`: tercera contraseña `SEED_COURIER_PASSWORD` (`courierPassword`) con la misma validación.
- `src/seed/seed.ts`: añade `{ username: 'repartidor', role: 'repartidor' }` a la lista de usuarios del seed.
- `.env.example`, `test/helpers/database.ts` y `test/unit/seed-credentials.spec.ts`: variable nueva.

## Pruebas

Jest + Supertest + PostgreSQL real (`postgres-test`); umbral global del 80 % intacto.

- `test/database/persistence.e2e-spec.ts`: migración con los cuatro roles, rechazo de rol desconocido, `down()` con y sin usuarios nuevos (CA-01, CA-02).
- `test/database/users.e2e-spec.ts` y `users-crud.e2e-spec.ts`: creación y cambio de rol con los nuevos valores, `cliente` rechazado, `409` para un cliente existente, último admin intacto (CA-03 a CA-08).
- `test/database/roles.e2e-spec.ts` (nueva): matriz `admin | operador | repartidor | cliente` contra `/users`, `/movements` y `/products`, más login de los nuevos roles (CA-09 a CA-11).
- `test/database/cors.e2e-spec.ts` (nueva): preflight, origen listado, no listado y lista vacía (CA-12, CA-13).
- `test/unit/environment.spec.ts`: `parseCorsOrigins` y TTL con casos válidos e inválidos (CA-14, CA-16).
- `test/database/auth.e2e-spec.ts`: TTL de 120 s, `exp - iat`, y JWT con issuer/audience viejos → `401` (CA-15, CA-17).
- `test/database/seed.e2e-spec.ts` y `test/unit/seed-credentials.spec.ts` (CA-18, CA-19).
- `test/swagger.e2e-spec.ts`: título, 19 operaciones y enums (CA-20).

## Postman

Si la colección sigue en el repositorio, se agrega una variable `courierPassword`, un login de `repartidor` con aserciones de `403` en `/users` y `/movements`, y se ajusta el texto de roles. No se agregan rutas.

## Riesgos

- **Invalidación de JWT** por el cambio de issuer/audience: sin impacto real hoy; se documenta en el overview.
- **CORS mal configurado en producción**: sin `CORS_ORIGINS` la API queda cerrada para el navegador, lo que falla de forma visible y segura. Hay que definir la variable en Railway cuando exista la URL del frontend.
- **`down()` condicional**: puede impedir revertir en una base con cuentas nuevas; es intencional.
- **Volumen local con la base anterior**: sin recrearlo, la API no conecta (`database "mocca_go" does not exist`). Se documenta en el README y en el overview.
- **Railway**: se vuelve a crear el proyecto; hay que cargar `DB_*`, `JWT_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`, `CORS_ORIGINS` (URL del frontend), `TRUST_PROXY_HOPS=1` y las tres contraseñas de seed. El pipeline de despliegue de 010 no existe en este repositorio (no hay `.github/`), así que se configura aparte.
- **Contraseña de seed nueva**: despliegues y CI que ejecuten el seed necesitan `SEED_COURIER_PASSWORD`.
