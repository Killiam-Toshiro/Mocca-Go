# Especificación 001 — API de inventario

Fecha: auditoría 2026-10-13. Estado: main 635e928 publicada/desplegada, con catálogo, movimientos, CRUD completo, readiness, Swagger y Postman. 554 pruebas/22 suites y colección completa repetidas sin fallos. El usuario confirma informe terminado, pendiente de compartir para revisión. JWT/login/logout verificados; el usuario excluye 2FA del alcance vigente (D-65). Solo se actualiza documentación.

## Objetivo y alcance

Construir una API REST de inventario con NestJS, PostgreSQL y TypeORM. El grupo eligió inventario y Spec-Driven Design con archivos versionados. El alcance inicial propuesto comprende productos, existencias y movimientos, en un único inventario y con cantidades enteras.

No se incluyen inicialmente ventas, facturación, proveedores, múltiples bodegas, imágenes ni interfaz gráfica. Si se incorporan, se actualizará esta especificación antes de implementarlos.

## Actores e historias

- **Admin:** inicia sesión con usuario y contraseña (JWT), administra usuarios y roles, mantiene el catálogo, consulta existencias e historial y registra movimientos.
- **Operador:** inicia sesión con usuario y contraseña (JWT), consulta productos y existencias y registra entradas y salidas; no administra usuarios ni modifica el catálogo.

| Historia                        | Resultado verificable                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| HU-01: preparar una instalación | Un script crea el usuario `admin` y datos de demostración sin duplicarlos al repetirse. |
| HU-02: acceder de forma segura  | Usuario y contraseña válidos permiten obtener un JWT de acceso.                         |
| HU-03: cerrar sesión            | El token de la sesión cerrada deja de permitir acceso a rutas protegidas.               |
| HU-04: administrar permisos     | Solo admin crea usuarios o asigna los roles permitidos.                                 |
| HU-05: mantener el catálogo     | Admin crea y actualiza productos con SKU único y los desactiva.                         |
| HU-06: controlar existencias    | Entradas y salidas actualizan el saldo y dejan un movimiento auditable.                 |
| HU-07: consultar inventario     | Usuarios autenticados consultan catálogo, saldo e historial paginado.                   |

## Reglas de negocio

- RN-01: cada producto tiene ID UUID, SKU único canónico e inmutable, nombre, descripción opcional, estado activo y fechas de creación/actualización. En 006 se concreta formato en mayúsculas sin normalización automática (D-32).
- RN-02: un producto nuevo comienza con saldo cero. El saldo solo cambia por movimientos; no se permite editarlo directamente.
- RN-03: cada movimiento tiene ID, producto, tipo `IN` o `OUT`, cantidad entera positiva, motivo, usuario responsable y fecha. Los movimientos no se editan ni eliminan.
- RN-04: una salida no puede dejar saldo negativo. La validación, el cambio de saldo y el movimiento se ejecutan en una misma transacción, protegiendo el saldo también frente a peticiones concurrentes.
- RN-05: productos inactivos conservan su historial y no admiten nuevos movimientos.
- RN-06: una segunda ejecución del seed conserva los usuarios y movimientos existentes, no reinicia contraseñas ni borra datos de negocio.
- RN-07: los roles válidos son `admin` y `operador`; se validan en el servidor. Ninguna petición pública puede conceder privilegios.
- RN-08: solo se elimina físicamente un producto sin movimientos; con historial se desactiva (011).
- RN-09: admin puede cambiar username y contraseña de un usuario; una contraseña nueva revoca sus demás sesiones y reinicia su bloqueo (011).
- RN-10: solo se elimina físicamente un usuario sin movimientos; nunca el último admin ni el propio actor (011).
- RN-11: `GET /health/ready` comprueba PostgreSQL; `GET /health` no consulta la base (011).

## Autenticación y autorización

El alcance vigente, aprobado por el usuario el 2026-10-13, exige autenticación JWT con usuario/contraseña, sesiones revocables y rutas protegidas. 2FA queda fuera de alcance y no constituye una tarea pendiente. El enunciado original incluía ese factor; esta modificación registra la decisión del usuario, sin atribuirla al docente.

El incremento 004 implementó JWT con sesión, identidad, logout revocable y guards reutilizables, con un segundo factor TOTP que el incremento 007 retira ([especificación 007](../007-jwt-only-auth/spec.md)). El incremento 005 implementa creación/listado de usuarios y asignación de roles exclusiva para admin, con política de último admin y revalidación transaccional según [su especificación](../005-users/spec.md). Las especificaciones 004 y 005 se conservan como historia; en lo que se refiere al 2FA y a la credencial de enrolamiento rige la 007.

- Usuarios creados por admin; no habrá registro público en el alcance inicial.
- Contraseñas almacenadas mediante hash. Contraseñas, hashes y secretos no aparecen en respuestas ordinarias ni en logs.
- `login` valida usuario y contraseña y devuelve directamente un JWT de acceso de 15 minutos asociado a una sesión persistida.
- Cada JWT de acceso identifica usuario y sesión; las rutas protegidas verifican expiración, sesión activa y rol vigente. Cambiar un rol afecta los permisos de las siguientes peticiones.
- `logout` revoca la sesión en PostgreSQL; su JWT se rechaza en las siguientes peticiones. No basta con borrar el token en Postman.
- Se limitan los intentos de login por cuenta (5 fallos, 15 minutos) y por IP (20 por minuto).
- Un admin puede cambiar la contraseña de un usuario (011). El cambio por el propio usuario, la recuperación y la rotación de claves siguen pendientes para mantenimiento.

## Contratos HTTP

Prefijo: `/api/v1`. La tabla resume las rutas implementadas; DTOs, respuestas y límites completos se concretan en las especificaciones de cada incremento.

Actualmente están implementadas 19 operaciones: dos de health, tres `/auth/*`, seis `/users`, seis `/products` y dos `/movements`. Contratos exactos en [la especificación 006](../006-catalog/spec.md), [la 008](../008-movements/spec.md) y [la 011](../011-crud-completion/spec.md); POST de movimientos devuelve `{movement,stock}` y GET historial con responsable desde sesión. Persistencia/seed se verifican según 003; el primer enrolamiento se emite por script privado según 004 y la creación administrativa entrega credencial limitada según 005.

| Método y ruta                | Acceso                          | Parámetros principales                    | Resultado esperado                                                                   |
| ---------------------------- | ------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /health`                | Público                         | Ninguno                                   | `200`: proceso disponible; no garantiza conexión a BD.                               |
| `GET /health/ready`          | Público                         | Ninguno                                   | `200`: PostgreSQL responde; `503`: base de datos no disponible.                      |
| `POST /auth/login`           | Público, con límite de intentos | `username`, `password`                    | `200`: JWT de acceso; `401`: credenciales inválidas.                                 |
| `POST /auth/logout`          | Autenticado                     | Bearer JWT                                | `204`: sesión revocada.                                                              |
| `GET /auth/me`               | Autenticado                     | Bearer JWT                                | `200`: identidad y rol, sin secretos.                                                |
| `POST /users`                | Admin                           | `username`, `password`, `role`            | `201`: usuario seguro; `409`: username duplicado.                                    |
| `GET /users`                 | Admin                           | `page`, `limit`                           | `200`: usuarios paginados, sin secretos.                                             |
| `GET /users/:id`             | Admin                           | UUID                                      | `200`: usuario seguro; `404`: usuario inexistente.                                   |
| `PATCH /users/:id`           | Admin                           | UUID, `username?`, `password?`            | `200`: usuario actualizado; `409`: username duplicado.                               |
| `DELETE /users/:id`          | Admin                           | UUID                                      | `204`; `409`: último admin, propio usuario o con movimientos.                        |
| `PATCH /users/:id/role`      | Admin                           | UUID, `role`                              | `200`: rol actualizado; `404`: usuario inexistente.                                  |
| `POST /products`             | Admin                           | `sku`, `name`, `description?`             | `201`: producto con saldo cero; `409`: SKU duplicado.                                |
| `GET /products`              | Autenticado                     | `page`, `limit`, `search?`, `active?`     | `200`: catálogo paginado con existencias.                                            |
| `GET /products/:id`          | Autenticado                     | UUID                                      | `200`: producto y saldo; `404`: producto inexistente.                                |
| `PATCH /products/:id`        | Admin                           | UUID y campos de catálogo opcionales      | `200`: producto actualizado; no admite cambios de saldo.                             |
| `PATCH /products/:id/status` | Admin                           | UUID, `active`                            | `200`: producto activado o desactivado.                                              |
| `DELETE /products/:id`       | Admin                           | UUID                                      | `204`; `409`: el producto tiene movimientos.                                         |
| `POST /movements`            | Admin u operador                | `productId`, `type`, `quantity`, `reason` | `201`: movimiento y saldo resultante; `409`: saldo insuficiente o producto inactivo. |
| `GET /movements`             | Autenticado                     | `page`, `limit`, `productId?`, `type?`    | `200`: historial paginado con responsable y fecha.                                   |

Las rutas de la tabla son relativas al prefijo. `400` corresponde a parámetros inválidos o campos no permitidos, `401` a autenticación ausente/expirada/revocada y `403` a permisos insuficientes. Nunca se expone información interna de PostgreSQL en un error HTTP.

## Trazabilidad de la rúbrica

| ID   | Requisito                            | Peso | Criterio de aceptación y evidencia final                                                                                                                | Estado                                                                                                                        |
| ---- | ------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| R-01 | Seed                                 | 5%   | Script documentado crea `admin`, al menos un operador, productos y movimientos válidos; dos ejecuciones no duplican ni borran datos.                    | Implementado y verificado en commit 3                                                                                         |
| R-02 | Autenticación JWT (alcance acordado) | 5%   | Login con usuario/contraseña; JWT protege rutas; logout revoca acceso; pruebas de fallos, expiración y reutilización.                                   | Implementado y verificado; 2FA excluido por el usuario el 2026-10-13 (D-65)                                                   |
| R-03 | Autorización                         | 5%   | Admin y operador tienen permisos distintos; solo admin asigna roles; pruebas HTTP de `401`/`403` y cambio de rol.                                       | Implementado y verificado en 005: administración exclusiva para admin y roles vigentes                                        |
| R-04 | Pruebas                              | 25%  | Jest y Supertest con BD de prueba PostgreSQL real; cobertura global mínima del 80% en líneas, sentencias, funciones y ramas, verificada en CI.          | 554 pruebas/22 suites repetidas el 2026-10-13; 55 fuentes y todas las métricas >=80%; CI success 38324403873                  |
| R-05 | Persistencia                         | 10%  | TypeORM guarda datos en PostgreSQL; migraciones reproducibles; constraints y transacciones probadas; datos sobreviven al reinicio.                      | Implementado y verificado en commit 3                                                                                         |
| R-06 | Funcionalidades y Postman            | 25%  | Catálogo, saldos y movimientos cumplen RN-01 a RN-07; colección JSON y entorno permiten recorrer casos exitosos y errores.                              | Catálogo/movimientos/CRUD verificados; colección autocontenida versionada, 265 peticiones/619 aserciones repetidas sin fallos |
| R-07 | Informe                              | 10%  | Documenta cada endpoint, parámetros, respuestas, autenticación, autorización, persistencia y ejecución de pruebas con resultados reales.                | Terminado según confirmación del usuario el 2026-10-13; se compartirá después para revisar contenido/entrega                  |
| R-08 | Despliegue                           | 15%  | API accesible en nube; pipeline ejecuta checks, pruebas y despliegue automatizado con migraciones; se aporta URL y evidencia de una ejecución correcta. | Railway público y run 38324403873 verify/deploy/smoke success; comprobación pública health/readiness/docs 200 y sin JWT 401   |

Entrega transversal: README reproducible, URL del repositorio, URL de API, informe para Intu y commits que permitan verificar la participación del grupo. La suma de pesos es 100%.

## Escenarios mínimos de aceptación

1. Seed en una BD vacía → admin y datos válidos; repetirlo → sin duplicados, borrados ni alteración de credenciales existentes.
2. Contraseña correcta → JWT utilizable de inmediato; contraseña errónea o cuenta bloqueada → `401`.
3. JWT válido → acceso; JWT expirado, alterado o de sesión cerrada → `401`.
4. Operador intenta asignar roles o crear un producto → `403`; admin → permitido.
5. Crear dos productos con el mismo SKU canónico → el segundo devuelve `409`.
6. Entrada de 10 y salida de 4 → saldo 6 y dos movimientos con responsable.
7. Salida de 7 con saldo 6 → `409`, mismo saldo y sin movimiento nuevo.
8. Dos salidas simultáneas de 4 con saldo 6 → solo una tiene éxito, saldo 2 y un único movimiento nuevo.
9. Movimiento con cantidad cero, negativa o decimal → `400`; UUID inválido → `400`.
10. Producto inactivo → rechaza movimientos y conserva su historial.
11. Reiniciar la API → persisten productos, saldos, movimientos y revocaciones.
12. CI con cobertura por debajo del umbral o una prueba fallida → no despliega.

El commit 1 verifica documentación; el 2 base/health; el 3 persistencia/seed; el 4 autenticación; el 5 administración/roles; el 6 catálogo; el 7 retira 2FA; el 8 movimientos. El 9 Swagger, el 10 despliegue ya comprobado y el 11 CRUD/readiness/Postman. El informe está terminado según usuario y pendiente de revisión; el alcance actual confirma JWT-only.

Estimación del alcance acordado: R-01 (5) + R-02 (5) + R-03 (5) + R-04 (25) + R-05 (10) + R-06 (25) + R-08 (15) = **90% con evidencia técnica revisada**. Más R-07 (10), declarado terminado, da **100% condicionado a que el informe cumpla**. Esta estimación aplica al alcance modificado por el usuario, no acredita 2FA ni garantiza una nota sobre el enunciado original. Evidencias y límites en [la auditoría](../../docs/audits/2026-10-13-main.md).
