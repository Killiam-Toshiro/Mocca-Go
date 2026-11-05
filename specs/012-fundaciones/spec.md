# Especificación 012 — Fundaciones de Mocca Go

Fecha: 2026-11-04. Estado: **propuesta para revisión; sin código**. Rama: `feature-fundaciones`.

## Contexto

El backend nació como el taller de inventario (001–011) y ahora es la base de Mocca Go: café y snacks a domicilio en el campus de Icesi. Este incremento no agrega negocio nuevo; prepara el terreno para clientes (013), catálogo de venta (014), zonas y puntos de entrega (015), pedidos con pago demo (016), órdenes de cocina (017), rondas de despacho (018) y encuesta/métricas (019).

Cuatro carencias del código actual bloquean al frontend en Next.js y al modelo de roles:

1. Solo existen los roles `admin` y `operador`; Mocca Go necesita también `repartidor` y `cliente`.
2. No hay CORS: un navegador en otro origen no puede llamar a la API.
3. La sesión dura 15 minutos fijos (`ACCESS_SECONDS = 900`) y no hay refresh; es incómodo para un cliente que sigue su pedido.
4. La identidad visible del proyecto sigue siendo «inventario» (Swagger, JWT, `package.json`).

## Alcance

1. **Roles ampliados** a `admin`, `operador` (cocina), `repartidor` y `cliente`, con migración nueva.
2. **CORS configurable** por variable de entorno.
3. **Duración del JWT configurable** por variable de entorno.
4. **Identidad Mocca Go** en nombres visibles (Swagger, issuer/audience del JWT, `package.json`, README).
5. **Seed** con un usuario `repartidor` adicional.
6. **Base de datos de desarrollo renombrada** a `mocca_go` (nombre, usuario y contraseña de ejemplo).

Rutas relativas a `/api/v1`. **No agrega rutas**: la API conserva 19 operaciones. Sin dependencias nuevas (`@nestjs/platform-express` ya incluye CORS).

Fuera de alcance:

- Registro público de clientes y perfil de cliente (013). En este incremento nadie puede crear un `cliente` por la API.
- Tablas de dominio (productos de venta, pedidos, etc.).
- Refresh tokens, recuperación de contraseña y almacenamiento compartido del limitador de peticiones.
- Modificar `compose.yaml`: servicios, puertos, volumen `inventory_data` y la base efímera `inventory_test` de pruebas se quedan como están (D-69). Los nombres de las migraciones ya aplicadas tampoco cambian.

## Modelo de roles

| Rol          | Quién es                          | Cómo se crea                      | Acceso en este incremento                                 |
| ------------ | --------------------------------- | --------------------------------- | --------------------------------------------------------- |
| `admin`      | Equipo de Mocca Go                | Seed o `POST /users` por un admin | Todo lo que tiene hoy                                     |
| `operador`   | Preparador de cocina              | Seed o `POST /users` por un admin | Todo lo que tiene hoy (catálogo en lectura y movimientos) |
| `repartidor` | Quien entrega pedidos             | Seed o `POST /users` por un admin | Catálogo en lectura; sin movimientos ni administración    |
| `cliente`    | Estudiante, docente o colaborador | Registro propio (013)             | Catálogo en lectura; sin movimientos ni administración    |

Reglas:

- **RN-12 — Roles válidos.** Los roles válidos son `admin`, `operador`, `repartidor` y `cliente`; se validan en el servidor y en un CHECK de PostgreSQL. Reemplaza RN-07 («admin y operador»).
- **RN-13 — Roles de personal.** Un admin solo puede asignar los roles de personal (`admin`, `operador`, `repartidor`) al crear un usuario o cambiar su rol. `cliente` nace únicamente del registro propio (013).
- **RN-14 — El cliente no cambia de rol.** `PATCH /users/:id/role` sobre un usuario `cliente` responde `409`. Un cliente tampoco se convierte en personal ni a la inversa.
- **RN-15 — Permisos sin cambios.** Los guards existentes no se modifican: `/users` es solo admin, `/movements` es `admin` y `operador`, las escrituras de `/products` son solo admin y las lecturas de `/products` admiten cualquier usuario autenticado. Por tanto `repartidor` y `cliente` reciben `403` en `/users` y `/movements`, y pueden leer el catálogo.
- La regla del último admin (RN de 005/011) se conserva intacta.

## Contratos

### Roles en usuarios

- `POST /users`: `role` ∈ {`admin`, `operador`, `repartidor`}. `cliente` y cualquier otro valor → `400`.
- `PATCH /users/:id/role`: `role` con el mismo conjunto. Si el destino es `cliente` → `409 "Un cliente no cambia de rol."`. El orden de errores de 011 se conserva (`401 → 403 → 400 → 404 → 409`); la regla de cliente se evalúa después de `404` y antes de la regla de último admin (un cliente nunca es admin, así que no interactúan).
- Todas las respuestas que muestran un rol (`users`, `auth`) documentan el enum completo de cuatro valores.
- `POST /auth/login` funciona igual para los cuatro roles y devuelve `role`.

### Variables de entorno nuevas

| Variable                   | Por defecto | Regla                                                                                                                                             |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CORS_ORIGINS`             | vacío       | Lista separada por comas de orígenes absolutos (`http(s)://host[:puerto]`, sin ruta, sin `/` final, sin `*`). Vacío = CORS desactivado, como hoy. |
| `ACCESS_TOKEN_TTL_SECONDS` | `900`       | Entero entre 60 y 86400, solo dígitos. Define `expiresIn` del JWT, `expiresAt` de la sesión y el texto de Swagger.                                |
| `SEED_COURIER_PASSWORD`    | sin valor   | Obligatoria para `npm run seed`; 12 a 128 caracteres, igual que las otras dos contraseñas de seed.                                                |

Una configuración inválida impide arrancar e indica la variable sin mostrar su valor (comportamiento ya vigente).

### CORS

- Con `CORS_ORIGINS` definido, la API responde a peticiones de esos orígenes con `Access-Control-Allow-Origin` igual al origen solicitado (nunca `*`) y `Vary: Origin`.
- Métodos permitidos: `GET, POST, PATCH, DELETE, OPTIONS`. Cabeceras permitidas: `Authorization`, `Content-Type`. Sin credenciales (el JWT viaja en `Authorization`, no en cookies). Preflight `OPTIONS` → `204` con `Access-Control-Max-Age: 600`.
- Un origen que no está en la lista no recibe `Access-Control-Allow-Origin`; la petición no se bloquea en el servidor, pero el navegador la rechaza. (El preflight sigue anunciando métodos y cabeceras permitidos, que es el comportamiento estándar del middleware.)
- Desarrollo local: la API sigue en el puerto `3000`; el frontend Next.js se ejecuta en `3001` (`next dev -p 3001`) y `.env.example` incluye `CORS_ORIGINS=http://localhost:3001`.

### Identidad

- Swagger: título `API de Mocca Go`; descripción orientada al negocio con el tiempo real de vida del token.
- JWT: `issuer = mocca-go-api`, `audience = mocca-go-client`. Los JWT emitidos antes del cambio dejan de ser válidos (aceptable: no hay usuarios reales todavía).
- `package.json`: `name = mocca-go-backend` y descripción actualizada.
- Base de datos de desarrollo: `DB_NAME` y `DB_USERNAME` pasan a `mocca_go` por defecto en el código y en `.env.example`, y `DB_PASSWORD` de ejemplo a `mocca_go_local_only`. Las tablas y migraciones no cambian. Un volumen de PostgreSQL creado antes conserva la base `inventory`, así que en local hay que recrearlo una vez (ver plan).

### Seed

Crea además `repartidor` (rol `repartidor`) si no existe, sin reiniciar contraseñas. El resto del comportamiento (transacción, idempotencia, inventario de ejemplo) no cambia; el catálogo de ejemplo se reemplaza en 014.

## Criterios de aceptación

| ID    | Escenario                                                                                      | Resultado                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| CA-01 | Aplicar la migración y insertar usuarios con cada uno de los 4 roles / con un rol desconocido  | Los cuatro se aceptan / el CHECK `users_role_valid` rechaza el desconocido                             |
| CA-02 | `down()` con y sin usuarios `repartidor` o `cliente`                                           | Con ellos aborta sin cambiar nada; sin ellos restaura el CHECK de dos roles                            |
| CA-03 | Admin crea usuario con `operador`, `repartidor` y `admin`                                      | `201` en los tres; la respuesta muestra el rol                                                         |
| CA-04 | Admin crea usuario con `cliente` o con un rol inexistente                                      | `400`; no se crea nada                                                                                 |
| CA-05 | Admin cambia el rol de un usuario de personal a `repartidor`                                   | `200` con el rol nuevo                                                                                 |
| CA-06 | Admin envía `role: "cliente"` a `PATCH /users/:id/role`                                        | `400`                                                                                                  |
| CA-07 | Admin cambia el rol de un usuario que ya es `cliente` (creado directo en la base en la prueba) | `409 "Un cliente no cambia de rol."`; sin cambios                                                      |
| CA-08 | La regla del último admin de 005/011                                                           | Se comporta igual que antes (pruebas existentes sin modificar su resultado)                            |
| CA-09 | `repartidor` y `cliente` llaman `/users` y `/movements`                                        | `403` en ambos                                                                                         |
| CA-10 | `repartidor` y `cliente` llaman `GET /products`; `POST /products`                              | `200`; `403`                                                                                           |
| CA-11 | Login de un `repartidor` y de un `cliente`                                                     | `200` con su rol                                                                                       |
| CA-12 | Preflight desde un origen listado en `CORS_ORIGINS`                                            | `204`, `Access-Control-Allow-Origin` = origen, métodos y cabeceras esperados, `Max-Age: 600`           |
| CA-13 | Petición real desde un origen listado / desde uno no listado / con `CORS_ORIGINS` vacío        | Con `Allow-Origin` y `Vary: Origin` / sin `Allow-Origin` / sin `Allow-Origin`                          |
| CA-14 | `CORS_ORIGINS` con `*`, con ruta, sin esquema, con `/` final o con una entrada vacía en medio  | La aplicación no arranca; el mensaje nombra la variable y no muestra su valor                          |
| CA-15 | `ACCESS_TOKEN_TTL_SECONDS=120` y login                                                         | `expiresIn = 120`; `exp - iat = 120` en el JWT; `expiresAt` de la sesión coherente                     |
| CA-16 | `ACCESS_TOKEN_TTL_SECONDS` ausente / `59` / `86401` / `12.5` / `abc`                           | Se usa `900` / la aplicación no arranca en los otros cuatro casos                                      |
| CA-17 | JWT firmado con el issuer o audience anteriores                                                | `401`                                                                                                  |
| CA-18 | `npm run seed` dos veces                                                                       | Crea `admin`, `operador` y `repartidor` una sola vez; no reinicia contraseñas                          |
| CA-19 | `npm run seed` sin `SEED_COURIER_PASSWORD` o con menos de 12 caracteres                        | Error que nombra la variable; no se crea nada                                                          |
| CA-20 | Swagger JSON                                                                                   | Título `API de Mocca Go`; exactamente 19 operaciones; enum de 4 roles en respuestas y de 3 en creación |
| CA-21 | Cobertura global                                                                               | ≥ 80 % en líneas, sentencias, funciones y ramas                                                        |
| CA-22 | `DB_NAME` y `DB_USERNAME` ausentes en la configuración de la base                              | Se usan `mocca_go` y `mocca_go`; la base de pruebas sigue exigiendo el sufijo `_test`                  |

## Trazabilidad

| Criterio      | Prueba                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------ |
| CA-01         | `test/database/roles.e2e-spec.ts` (restricción de PostgreSQL) y `persistence.e2e-spec.ts`        |
| CA-02         | `test/database/roles-migration.e2e-spec.ts`                                                      |
| CA-03 a CA-08 | `test/database/roles.e2e-spec.ts` y las suites existentes de usuarios (último admin sin cambios) |
| CA-09 a CA-11 | `test/database/roles.e2e-spec.ts`                                                                |
| CA-12, CA-13  | `test/database/cors.e2e-spec.ts`                                                                 |
| CA-14, CA-16  | `test/unit/environment.spec.ts` (análisis de `CORS_ORIGINS` y de `ACCESS_TOKEN_TTL_SECONDS`)     |
| CA-15, CA-17  | `test/database/auth-config.e2e-spec.ts`                                                          |
| CA-18, CA-19  | `test/database/seed.e2e-spec.ts` y `test/unit/seed-credentials.spec.ts`                          |
| CA-20         | `test/swagger.e2e-spec.ts`                                                                       |
| CA-21         | `npm run test:cov`                                                                               |
| CA-22         | `test/unit/database-config.spec.ts`                                                              |
