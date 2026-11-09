# Mocca Go — traspaso para el frontend

Fecha: 2026-11-09. Backend cerrado hasta el incremento 019 (53 operaciones). Este documento es el contexto completo para empezar el frontend en un chat nuevo. Léelo entero antes de proponer nada.

## 1. Cómo trabajar con el usuario

- El usuario es Sebastián (Compunet 3, Universidad Icesi). **Siempre responde en español.**
- Metodología **Spec-Driven Design**: spec → aprobación del usuario → `plan.md` → `tasks.md` → código → pruebas → `docs/commits/NNN.md` (overview). Tras cada incremento, **detente para su revisión**.
- **No hagas commit ni push** salvo que lo pida. Él los hace (o te lo pide).
- Las decisiones se registran en `docs/decisions.md` (D-nnn) y los criterios de aceptación en la spec (CA-nn).
- Verifica con evidencia real (comandos y números), no con afirmaciones.
- El backend vive en otro repositorio (`Mocca-Go`, NestJS). **El frontend va en un repositorio nuevo**, con Next.js.

## 2. Qué es Mocca Go

Domicilios de café y snacks dentro del campus de la Universidad Icesi (Cali, Colombia). El cliente pide desde un punto del campus (zona, punto, piso), paga con una tarjeta de demostración, la cocina prepara, un repartidor reparte por rondas, el cliente califica y el admin ve métricas. Moneda: pesos COP enteros. Zona horaria: America/Bogota (UTC−5).

## 3. Roles y vistas que debe tener el frontend

| Rol          | Vista                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| (sin sesión) | Menú público, zonas/puntos, registro de cliente, login.                                                                                |
| `cliente`    | Menú, carrito, pedido con pago de demostración, seguimiento en vivo, cancelar, encuesta, mi perfil.                                    |
| `operador`   | Cola de cocina en vivo (empezar/listo), marcar «agotado», ver pedidos y rondas, movimientos de inventario, ver encuestas en el pedido. |
| `repartidor` | Cola de despacho por zona, crear ronda, entregar / «no entregado», rondas propias, canal en vivo.                                      |
| `admin`      | Todo lo de consulta + usuarios, catálogo y combos, zonas y puntos, encuestas, panel de métricas, movimientos.                          |

El back impone los permisos; el front solo debe ocultar lo que el rol no puede usar.

## 4. Conexión con el back

- Base: `https://<host>/api/v1`. Variable del front: `NEXT_PUBLIC_API_URL` (local: `http://localhost:3000/api/v1`).
- **CORS:** el back lee `CORS_ORIGINS` (lista de orígenes separados por coma). Local: `http://localhost:3001`. Hay que añadir el dominio desplegado del front.
- **Contrato:** Swagger UI en `/api/v1/docs` y el JSON en `/api/v1/docs-json` (copia en `docs/openapi.json`). Genera el cliente tipado desde ahí (`openapi-typescript` + `openapi-fetch`, u `orval`).
- **Autenticación:** `POST /auth/login` con `{ username, password }` (personal) o `{ email, password }` (cliente). Responde `{ accessToken, tokenType: "Bearer", expiresIn }` (segundos). Se envía `Authorization: Bearer <token>` en cada petición. La contraseña mínima es de **12 caracteres**. **No existe endpoint de renovación (refresh):** al vencer el token (15 min en pruebas; `ACCESS_TOKEN_TTL_SECONDS`, 8 h por defecto en `.env.example`) hay que volver a iniciar sesión; un `401` debe llevar al login. `POST /auth/logout` revoca la sesión; `GET /auth/me` devuelve `{id, username, role}`.
- **Errores:** `{ "message": string | string[], "error": "Bad Request", "statusCode": 400 }`. `message` es un arreglo en errores de validación. Los mensajes están en español y se pueden mostrar. Códigos usados: 400 validación, 401 sin sesión, 403 rol, 404 no existe o no es tuyo, 409 conflicto de estado, 429 límite de peticiones.
- **Paginación:** `?page=&limit=`; respuesta `{ data, total, page, limit }`.
- **Sin caché:** las rutas privadas responden `Cache-Control: no-store`.
- **Límites:** `POST /orders` admite 10 por minuto por IP; los canales SSE, 30 aperturas por minuto por IP y 5 abiertos por usuario.

## 5. Rutas (53 operaciones)

Resumen generado del Swagger. «auth» = requiere token; el rol exacto está en el resumen.

| Módulo          | Método y ruta                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| auth            | `POST /auth/login` (público), `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/password`                                                                                                                                                              |
| customers       | `POST /customers` (público: registro), `GET /customers/me`, `PATCH /customers/me` (cliente)                                                                                                                                                            |
| menu            | `GET /menu` (público: productos vendibles con `available` y componentes del combo)                                                                                                                                                                     |
| delivery-zones  | `GET /delivery-zones` (público: zonas y puntos activos), `GET /delivery-zones/all`, `POST`, `PATCH /:id`, `DELETE /:id` (admin)                                                                                                                        |
| delivery-points | `POST /delivery-points`, `PATCH /:id`, `DELETE /:id` (admin)                                                                                                                                                                                           |
| orders          | `POST /orders` (cliente, cabecera `Idempotency-Key`), `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/survey` (cliente), `GET /orders/stream` (SSE cliente)                                                             |
| kitchen         | `GET /kitchen/orders`, `POST /kitchen/orders/:id/start`, `POST /kitchen/orders/:id/ready`, `GET /kitchen/stream` (SSE) — operador y admin                                                                                                              |
| dispatch        | `GET /dispatch/queue`, `POST /dispatch/rounds`, `GET /dispatch/rounds`, `GET /dispatch/rounds/:id`, `POST /dispatch/orders/:id/deliver`, `POST /dispatch/orders/:id/fail`, `GET /dispatch/stream` (SSE) — repartidor (admin y operador solo consultan) |
| surveys         | `GET /surveys` (admin)                                                                                                                                                                                                                                 |
| metrics         | `GET /metrics?from=&to=&zoneId=` (admin)                                                                                                                                                                                                               |
| products        | `GET/POST /products`, `GET/PATCH/DELETE /products/:id`, `PATCH /:id/status`, `PATCH /:id/sold-out`, `PUT /:id/components` (admin; admin y operador consultan y marcan «agotado»)                                                                       |
| movements       | `GET /movements`, `POST /movements` (admin y operador)                                                                                                                                                                                                 |
| users           | `GET/POST /users`, `GET/PATCH/DELETE /users/:id`, `PATCH /users/:id/role` (admin)                                                                                                                                                                      |
| health          | `GET /health`, `GET /health/ready`                                                                                                                                                                                                                     |

## 6. Reglas de negocio que afectan al front

**Pedido** (`POST /orders`): cuerpo `{ items:[{productId, quantity}], pointId, floor?, deliveryNote?, note?, payment:{method:"tarjeta_demo", cardNumber} }` con cabecera `Idempotency-Key` (UUID nuevo por intento de compra; reenviar la misma clave devuelve el mismo pedido). `floor` es obligatorio si el punto tiene pisos y se omite si no (`floors: null`). Tarjeta de demostración aprobada: `4242424242424242`. El saldo se descuenta al crear y se devuelve al cancelar.

**Estados del pedido:** `recibido → en_preparacion → listo → en_camino → entregado`. Finales: `entregado`, `cancelado`, `no_entregado`. El cliente cancela solo en `recibido`; admin y operador hasta `en_preparacion`, con motivo (`cancelReason`). Toda cancelación reembolsa; `no_entregado` no reembolsa y su tratamiento queda pendiente.

**Seguimiento:** el pedido trae `events` (historial `{status, at}`). Mientras está `en_camino`, `delivery.courier {fullName, phone, whatsappUrl}` y `delivery.etaAt` (salida + 15 min); en otros estados son `null`. En `no_entregado` trae `failureReason`.

**Encuesta:** solo el cliente dueño, solo pedido `entregado`, una vez, no se edita. `{rating 1..5, comment? ≤300}`. Se ve en el pedido (`survey`: objeto o `null`): el front muestra el formulario cuando `status === 'entregado' && survey === null`.

**Cocina:** `start` (`recibido → en_preparacion`) y `ready` (`en_preparacion → listo`); `409` si el estado ya cambió (otro operador).

**Despacho:** el repartidor arma su ronda: sin cuerpo toma la sugerencia (zona del `listo` más antiguo, hasta 5 pedidos) o `orderIds` con una ruta propia de una sola zona. Máximo 5 pedidos por ronda y 2 rondas activas por repartidor. `deliver` y `fail` (`reason` obligatorio, ≤200). La ronda se cierra sola al terminar todos sus pedidos.

**Catálogo:** categorías `combo, cafe, bebida, panaderia, pasteleria, snack`. Un combo se compone de otros productos; su precio es opcional al crearlo (por defecto, la suma de sus componentes); `available` lo calcula el back (activo, no agotado, con saldo). El menú solo trae productos vendibles; el listado del admin trae todos.

**Métricas** (`GET /metrics`): `from`/`to` en `YYYY-MM-DD` (por defecto 30 días, máximo 366), `zoneId` opcional. Secciones: `period`, `sales` (con `daily` de ceros incluidos), `margin` (total y `byCategory`), `delivery` (a tiempo, tiempos y etapas, `byZone`), `satisfaction` (promedio y distribución 1–5), `retention`, `outcomes`. Valores nulos (`null`) cuando no hay datos.

## 7. Tiempo real (SSE)

Hay tres canales: `GET /orders/stream` (cliente), `GET /kitchen/stream` (operador y admin) y `GET /dispatch/stream` (repartidor). `EventSource` **no permite enviar `Authorization`**, así que se usa `fetch` con lectura de flujo (`response.body.getReader()` o la librería `@microsoft/fetch-event-source`) enviando el Bearer.

Protocolo: al abrir y en cada reconexión llega un evento `ready` → el front **vuelve a consultar** la lista (`GET /orders`, `/kitchen/orders` o `/dispatch/queue`) y desde entonces aplica los eventos `order`. Cada 25 s llega un comentario de latido; si la sesión se revoca el servidor cierra el canal. Implementa reconexión con espera creciente.

## 8. Datos de prueba (entorno local con `npm run seed`)

Usuarios del personal: `admin`, `operador`, `repartidor` (contraseñas en el `.env` del back: `SEED_ADMIN_PASSWORD`, `SEED_OPERATOR_PASSWORD`, `SEED_COURIER_PASSWORD`). El seed crea zonas y 17 puntos del campus, el menú (capuchino `CAF-CAPU`, pandebono, combos…) y el repartidor de demostración con teléfono. Los clientes se registran con `POST /customers` (`email`, `password`, `fullName`, `phone` colombiano, p. ej. `300 765 4322`).

## 9. Cómo correr el back

Requiere Node 24 y PostgreSQL 16 (Docker: `npm run db:up`). Pasos: copiar `.env.example` a `.env`, `npm ci`, `npm run migration:run`, `npm run seed`, `npm run start:dev` (puerto 3000). Las pruebas del back usan `npm run db:test:up` y `npm run test:cov`.

## 10. Propuesta de frontend (por confirmar con el usuario)

- **Repo nuevo** con Next.js (App Router), TypeScript, Tailwind (y shadcn/ui si lo aprueba), ESLint, Prettier y pruebas (Vitest + Testing Library; Playwright para flujos clave).
- **Datos:** cliente tipado generado desde `docs/openapi.json`; TanStack Query para consultas y mutaciones.
- **Sesión:** token en memoria o `sessionStorage` (decisión pendiente; alternativa: cookie `httpOnly` con rutas de Next.js como intermediario).
- **Orden de incrementos:** (1) base, login/registro y rutas por rol; (2) menú y carrito; (3) pedido, pago y seguimiento en vivo; (4) cocina; (5) repartidor; (6) cliente: encuesta y perfil; (7) admin: catálogo, zonas, usuarios; (8) admin: encuestas y panel de métricas; (9) despliegue.
- **Preguntas abiertas para el usuario:** ¿solo web responsive o también panel de escritorio para la cocina?; ¿librería de UI?; ¿dónde se despliega (Vercel, Railway…)?; ¿dónde guardar el token?

## 11. Pendientes del backend que el front debe tener presentes

- Sin refresh de token (sesión corta).
- Qué hacer con los pedidos `no_entregado` (reembolso, reintento) está sin decidir.
- Módulo `movements`: queda para reponer y ajustar stock; el front puede omitirlo al inicio o mostrar solo «Ingresar stock».
- La documentación detallada de cada incremento está en `specs/NNN-*/spec.md` y `docs/commits/NNN.md` del repo del back.
