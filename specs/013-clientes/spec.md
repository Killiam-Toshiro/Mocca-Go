# Especificación 013 — Clientes

Fecha: 2026-11-05. Estado: **aprobada por el usuario (2026-11-05) con una ampliación: cambio de contraseña para todos los roles**. Rama: `feature-fundaciones`.

## Contexto

El incremento 012 dejó el rol `cliente` en la base, pero nadie puede crearlo: no hay registro público. Sin clientes no hay pedidos (016). Este incremento agrega el **registro con correo y contraseña**, el **inicio de sesión con correo** y el **perfil** del cliente, incluido su **teléfono celular**, que más adelante servirá para avisarle por WhatsApp o SMS que su pedido va en camino.

El «origen de adquisición» (QR, redes, etc.) que se había propuesto **queda fuera**: no se necesita ahora y, si el KPI de conversión de QR lo pide, se agrega en 019 sin migrar este modelo.

## Alcance

1. **Registro público de clientes** con correo, contraseña, nombre y teléfono.
2. **Inicio de sesión con correo** para clientes. El inicio con `username` del personal se conserva.
3. **Perfil propio**: consultar y editar nombre y teléfono.
4. **Cambio de contraseña propio para todos los roles** (`admin`, `operador`, `repartidor` y `cliente`).
5. **Tabla `customers`** (migración nueva), 1 a 1 con `users`.
6. **Límite de frecuencia más estricto** en el registro.

Rutas relativas a `/api/v1`. Pasa de 19 a **23 operaciones**: `POST /customers`, `GET /customers/me`, `PATCH /customers/me` y `PATCH /auth/password`. `POST /auth/login` cambia de contrato (ver más abajo) pero no es una operación nueva. Sin dependencias nuevas.

Fuera de alcance:

- **Envío de WhatsApp o SMS.** Solo se guarda el teléfono, en un formato listo para un proveedor (E.164).
- Verificación del correo y del teléfono (código o enlace), recuperación de contraseña por correo y cambio de correo. Quien **olvida** la contraseña (no puede iniciar sesión) la restablece un admin con `PATCH /users/:id`; quien la **recuerda** la cambia solo con `PATCH /auth/password`.
- Listado de clientes para el personal (`GET /customers`); se agrega cuando un módulo lo necesite (p. ej. 016 o 019).
- Origen de adquisición, direcciones y puntos de entrega favoritos (015).
- Sembrar un cliente en el seed; las pruebas y Postman se registran por la API.

## Modelo de datos

El cliente es un `users` con rol `cliente` más una fila en `customers`. Así el login, las sesiones, el bloqueo por intentos fallidos y los guards se reutilizan sin cambios, y los pedidos futuros referencian al cliente por el mismo `id`.

`customers`:

| Columna      | Tipo         | Regla                                                                                                |
| ------------ | ------------ | ---------------------------------------------------------------------------------------------------- |
| `user_id`    | uuid, PK     | FK a `users(id)` con `ON DELETE CASCADE`                                                             |
| `email`      | varchar(254) | Único; siempre en minúsculas (CHECK `email = lower(email)`)                                          |
| `full_name`  | varchar(100) | CHECK: al menos 2 caracteres tras recortar espacios                                                  |
| `phone`      | varchar(16)  | CHECK: formato E.164 `^\+[1-9][0-9]{7,14}$`. **No es único** (p. ej. un teléfono compartido en casa) |
| `created_at` | timestamptz  |                                                                                                      |
| `updated_at` | timestamptz  |                                                                                                      |

El `username` del usuario de un cliente es **interno**: se genera (`c` + 16 caracteres hexadecimales aleatorios) para cumplir el formato y la unicidad existentes, y no se muestra en las respuestas de `/customers`. El cliente nunca lo usa.

## Reglas de negocio

- **RN-16 — Correo.** Se recorta, se pasa a minúsculas, debe tener formato de correo válido y como máximo 254 caracteres. Es único sin distinguir mayúsculas. Un correo ya registrado → `409 "El correo ya está registrado."`.
- **RN-17 — Contraseña.** De 12 a 128 caracteres, igual que el personal (se guarda con hash scrypt, nunca se devuelve).
- **RN-18 — Nombre.** De 2 a 100 caracteres tras recortar espacios al inicio y al final.
- **RN-19 — Teléfono.** Obligatorio. Se aceptan celulares colombianos y números internacionales, y siempre se **guarda normalizado a E.164**:
  - Se ignoran espacios, guiones y paréntesis.
  - 10 dígitos que empiezan por `3` (p. ej. `300 123 4567`) → `+573001234567`.
  - Con prefijo `+57`, `57` o `0057` seguido de un celular colombiano → `+57…`.
  - Con `+` y código de país distinto de 57 → se valida solo que sea E.164 (8 a 15 dígitos, sin empezar en 0).
  - Cualquier otra cosa (letras, número incompleto, fijo colombiano) → `400`.
- **RN-20 — Registro atómico.** Crear el cliente inserta `users` (rol `cliente`) y `customers` en una sola transacción: o quedan ambas filas o ninguna. Una carrera por el mismo correo termina en `409` para quien pierde, nunca en `500`.
- **RN-21 — Inicio de sesión.** `POST /auth/login` recibe `password` y **exactamente uno** de `username` (personal) o `email` (cliente). Ninguno o ambos → `400`. Los fallos son siempre `401 "Credenciales inválidas."` sin distinguir correo inexistente, contraseña errada o cuenta bloqueada. El bloqueo de 5 intentos / 15 minutos y las sesiones son los de siempre. Iniciar con `email` una cuenta de personal (no tiene fila en `customers`) → `401`.
- **RN-22 — Perfil.** `GET` y `PATCH /customers/me` son solo del rol `cliente` y solo muestran y modifican el cliente de la sesión; no existe forma de indicar otro `id`. `PATCH` acepta `fullName` y/o `phone` (al menos uno, ninguno `null`); el correo no se puede cambiar. Repetir los mismos valores no modifica `updatedAt`.
- **RN-23 — Aislamiento de roles.** Un cliente recibe `403` en `/users` y `/movements` y en las escrituras de `/products` (RN-15), y puede leer el catálogo. _Modificada por RN-36 de la [especificación 014](../014-catalogo-combos/spec.md): el cliente recibe `403` en `/products` y lee el menú público `GET /menu`._ El personal (`admin`, `operador`, `repartidor`) recibe `403` en `/customers/me`.
- **RN-24 — Administración existente.** `DELETE /users/:id` sobre un cliente lo elimina junto con su fila de `customers` (cascada); `PATCH /users/:id` con `password` sirve para restablecer su contraseña y revoca sus sesiones; `PATCH /users/:id/role` sigue respondiendo `409` (RN-14). Cuando existan pedidos (016) la eliminación de un cliente con pedidos se bloqueará allí.
- **RN-25 — Privacidad.** Ninguna respuesta ni mensaje de error devuelve contraseña ni hash, y las rutas `/customers` no devuelven el `username` interno (`GET /auth/me` sí lo devuelve, porque es la identidad de la propia sesión). El correo, el nombre y el teléfono de un cliente solo los ven él mismo y los admins (RN-27). El frontend debe informar al registrarse que el teléfono se usa para avisos del pedido (Ley 1581 de 2012, tratamiento de datos personales).

- **RN-26 — Cambio de contraseña propio (todos los roles).** Cualquier usuario autenticado (`admin`, `operador`, `repartidor`, `cliente`) cambia **su propia** contraseña con `PATCH /auth/password`, enviando la actual y la nueva (12 a 128 caracteres, RN-17). Reglas:
  - La contraseña actual se verifica con la misma comprobación y el mismo contador que el login: una contraseña actual incorrecta suma un fallo, cinco fallos bloquean la cuenta 15 minutos (el login y este cambio responden como bloqueados) y un cambio correcto reinicia el contador y el bloqueo. Así un JWT robado no sirve para adivinar la contraseña sin límite.
  - La contraseña nueva debe ser distinta de la actual.
  - Un cambio correcto **revoca todas las demás sesiones** del usuario y conserva la sesión desde la que se pidió; el JWT actual sigue siendo válido.
  - Solo se puede cambiar la propia contraseña; la ruta no recibe ningún `id`. El restablecimiento de la contraseña de otro usuario sigue siendo exclusivo del admin (`PATCH /users/:id`, RN-09).
  - Una cuenta de cliente o de personal bloqueada recibe el mismo error que una contraseña actual incorrecta, sin distinguirlos.

- **RN-27 — Datos de contacto en la administración de usuarios.** `GET /users` y `GET /users/:id` (solo admin, como hasta ahora) devuelven además `email`, `fullName` y `phone`. Para un cliente traen sus datos; para el personal (`admin`, `operador`, `repartidor`) los tres valen `null`, de modo que todas las respuestas de usuario tienen los mismos campos. Lo mismo aplica a las respuestas de `POST /users` y `PATCH /users/:id`. El `username` se sigue devolviendo; en un cliente es el identificador interno generado. El orden del listado y la paginación no cambian, y los demás roles siguen recibiendo `403`.

## Contratos

### `POST /customers` (público)

Cuerpo:

```json
{
  "email": "ana.perez@u.icesi.edu.co",
  "password": "una-clave-larga-123",
  "fullName": "Ana Pérez",
  "phone": "300 123 4567"
}
```

`201` con el perfil:

```json
{
  "id": "uuid",
  "email": "ana.perez@u.icesi.edu.co",
  "fullName": "Ana Pérez",
  "phone": "+573001234567",
  "createdAt": "…",
  "updatedAt": "…"
}
```

No inicia sesión automáticamente: el frontend llama después a `POST /auth/login` con `email` y `password`.

Errores, en este orden: `429` (límite de frecuencia) → `400` (validación; no se ejecuta nada) → `409` (correo ya registrado). Cualquier otro campo en el cuerpo, incluido `role`, → `400` (el rol es siempre `cliente`; la validación ya prohíbe campos desconocidos).

### `GET /customers/me` y `PATCH /customers/me`

Requieren `Authorization: Bearer` de un `cliente`. `GET` → `200` con el perfil. `PATCH` con `{ "fullName"?, "phone"? }` → `200` con el perfil actualizado. Errores: `401` → `403` → `400` → `200`.

### `PATCH /auth/password`

Requiere `Authorization: Bearer` de cualquier rol. Cuerpo:

```json
{
  "currentPassword": "la-clave-actual-123",
  "newPassword": "una-clave-nueva-456"
}
```

`204` sin cuerpo. Errores, en este orden: `429` → `401` (JWT inválido o sesión cerrada) → `400` (validación; campos desconocidos incluidos; o la nueva es igual a la actual) → `403 "La contraseña actual no es correcta."` (incorrecta o cuenta bloqueada). Se usa `403` y no `401` para que el frontend no confunda una contraseña errada con una sesión vencida y cierre la sesión del usuario.

### `POST /auth/login`

```json
{ "email": "ana.perez@u.icesi.edu.co", "password": "una-clave-larga-123" }
```

o, como hasta ahora, `{ "username": "admin", "password": "…" }`. La respuesta no cambia (`accessToken`, `tokenType`, `expiresIn`). Compatibilidad: todo cliente existente del API (Postman, pruebas) que envía `username` sigue funcionando.

### Límite de frecuencia

`POST /customers`: máximo **5 peticiones por minuto por IP** (`PATCH /auth/password` comparte el límite de 20 por minuto del resto de `/auth`) (el resto de la API conserva su límite actual). Es el mismo limitador en memoria de siempre, así que el límite aplica por instancia. El hash de la contraseña se calcula antes de tocar la base, y el `409` por correo duplicado no es más rápido que un registro correcto de forma que permita enumerar correos de manera sencilla por tiempo; se acepta que el propio `409` revela si un correo existe (compromiso asumido para una demo; el límite de frecuencia lo acota).

## Decisiones confirmadas por el usuario

1. **Contraseña mínima de 12 caracteres** también para clientes (consistencia con el personal) o más corta, p. ej. 8. Confirmado: 12.
2. **Teléfono colombiano e internacional** (por estudiantes de intercambio) o solo celulares colombianos. Confirmado: ambos.
3. **El `409` revela si un correo existe.** Confirmado. Es lo más simple y lo que espera un frontend; la alternativa (siempre `201` y avisar por correo) requiere enviar correos y no aplica a la demo.

## Criterios de aceptación

| ID    | Escenario                                                                                                       | Resultado                                                                                                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-01 | Aplicar la migración; revertirla sin y con filas en `customers`                                                 | Crea `customers` con sus restricciones / sin filas la elimina / con filas aborta sin cambios                                                                |
| CA-02 | Insertar `customers` con correo en mayúsculas, nombre de 1 carácter o teléfono sin `+`                          | Los CHECK de PostgreSQL lo rechazan; un correo repetido lo rechaza el índice único                                                                          |
| CA-03 | `POST /customers` con datos válidos                                                                             | `201` con el perfil; `role` del usuario creado = `cliente`; contraseña con hash; sin hash ni `username` en la respuesta                                     |
| CA-04 | Registro con correo `Ana@U.ICESI.edu.co ` (mayúsculas y espacios)                                               | Se guarda `ana@u.icesi.edu.co`; registrar luego `ANA@u.icesi.edu.co` → `409`                                                                                |
| CA-05 | Registro con correo inválido, sin correo, de más de 254 caracteres, o `null`                                    | `400`; no se crea ninguna fila                                                                                                                              |
| CA-06 | Registro con contraseña de 11 o 129 caracteres, no texto o ausente                                              | `400`; no se crea ninguna fila                                                                                                                              |
| CA-07 | Registro con nombre vacío, de 1 carácter, de más de 100 caracteres o solo espacios                              | `400`                                                                                                                                                       |
| CA-08 | Teléfonos `3001234567`, `300 123 4567`, `(300) 123-4567`, `+57 300 123 4567`, `573001234567`, `0057 3001234567` | Todos se guardan como `+573001234567`                                                                                                                       |
| CA-09 | Teléfono `+1 415 555 2671` / `+34 612 345 678`                                                                  | Se guarda `+14155552671` / `+34612345678`                                                                                                                   |
| CA-10 | Teléfono ausente, `2001234567`, `300123`, `abc`, `+0123456789`, con más de 15 dígitos, o `null`                 | `400`                                                                                                                                                       |
| CA-11 | Registro con `role: "admin"` u otro campo desconocido                                                           | `400`; no se crea nada                                                                                                                                      |
| CA-12 | Dos clientes con el mismo teléfono                                                                              | Ambos se registran (`201`)                                                                                                                                  |
| CA-13 | Dos registros simultáneos con el mismo correo                                                                   | Uno `201` y el otro `409`; una sola fila en `users` y en `customers`; ningún `500`                                                                          |
| CA-14 | Fallo al insertar `customers` tras insertar `users`                                                             | Se revierte todo: no queda un `users` huérfano                                                                                                              |
| CA-15 | Login con `email` y contraseña correctos (incluso con el correo escrito en mayúsculas)                          | `200` con `accessToken`; el JWT corresponde a un usuario `cliente`                                                                                          |
| CA-16 | Login con correo inexistente / contraseña errada / cuenta de personal usada con `email`                         | `401 "Credenciales inválidas."` idéntico en los tres                                                                                                        |
| CA-17 | Login sin `username` ni `email`, o con ambos, o con `email` inválido                                            | `400`                                                                                                                                                       |
| CA-18 | Login de personal con `username` como antes                                                                     | `200`; las pruebas existentes de login pasan sin cambios                                                                                                    |
| CA-19 | 5 contraseñas erradas con `email`; luego la correcta                                                            | La cuenta se bloquea 15 minutos (`401` aun con la correcta); se desbloquea al vencer, igual que con `username`                                              |
| CA-20 | `GET /customers/me` con sesión de cliente                                                                       | `200` con su perfil                                                                                                                                         |
| CA-21 | `GET` y `PATCH /customers/me` sin token / token inválido / con rol de personal                                  | `401` / `401` / `403`                                                                                                                                       |
| CA-22 | `PATCH /customers/me` con nombre, con teléfono, con ambos                                                       | `200`; refleja los cambios; el teléfono se normaliza a E.164                                                                                                |
| CA-23 | `PATCH /customers/me` vacío, con `null`, con `email`, con `password` o con un `id`                              | `400`; nada cambia                                                                                                                                          |
| CA-24 | `PATCH /customers/me` con los mismos valores actuales                                                           | `200` y `updatedAt` sin cambios                                                                                                                             |
| CA-25 | Dos clientes distintos consultan su perfil                                                                      | Cada uno ve solo el suyo                                                                                                                                    |
| CA-26 | Cliente llama `/users`, `/movements`, `POST /products`; llama `GET /products`                                   | `403` los tres primeros; `200` el último                                                                                                                    |
| CA-27 | Admin elimina un cliente con `DELETE /users/:id`; luego intenta iniciar sesión con su correo                    | `204`; no queda fila en `customers`; el login responde `401`; el correo puede registrarse de nuevo                                                          |
| CA-28 | Admin cambia la contraseña de un cliente con `PATCH /users/:id`; el cliente tenía sesión abierta                | La sesión anterior queda revocada; el cliente inicia sesión con la contraseña nueva                                                                         |
| CA-29 | Admin llama `PATCH /users/:id/role` sobre un cliente                                                            | `409 "Un cliente no cambia de rol."` (RN-14, ahora con clientes reales)                                                                                     |
| CA-30 | 6 registros en un minuto desde la misma IP                                                                      | Los 5 primeros responden normalmente; el sexto → `429`. El resto de las rutas conserva su límite                                                            |
| CA-31 | Ninguna respuesta de error de `/customers` o de login incluye la contraseña, el hash o el `username` interno    | Verificado en 400, 401, 403, 409 y 429                                                                                                                      |
| CA-32 | Cambio de contraseña válido con cada uno de los 4 roles                                                         | `204`; el login con la nueva funciona y con la anterior responde `401`                                                                                      |
| CA-33 | Cambio de contraseña con otras sesiones abiertas del mismo usuario                                              | Las otras sesiones quedan revocadas (`401`); la sesión que lo pidió sigue válida; las sesiones de otros usuarios no cambian                                 |
| CA-34 | Contraseña actual incorrecta                                                                                    | `403 "La contraseña actual no es correcta."`; la contraseña no cambia; suma un fallo                                                                        |
| CA-35 | Cinco contraseñas actuales incorrectas seguidas; luego la correcta                                              | La cuenta queda bloqueada 15 minutos: el cambio responde `403` y el login `401`; al vencer el bloqueo se puede cambiar                                      |
| CA-36 | Cambio correcto tras algunos fallos previos                                                                     | El contador de fallos y el bloqueo se reinician                                                                                                             |
| CA-37 | Contraseña nueva igual a la actual                                                                              | `400`; nada cambia                                                                                                                                          |
| CA-38 | Campos ausentes, no texto, de menos de 12 o más de 128 caracteres, `null`, o campos extra (`id`, `username`)    | `400`; nada cambia                                                                                                                                          |
| CA-39 | Cambio de contraseña sin token, con token inválido o de una sesión cerrada                                      | `401`                                                                                                                                                       |
| CA-40 | Ninguna respuesta de `PATCH /auth/password` incluye contraseñas ni hash                                         | Verificado en 204, 400, 401, 403 y 429                                                                                                                      |
| CA-41 | Swagger JSON                                                                                                    | Exactamente 23 operaciones; `POST /customers` público; `/customers/me` y `/auth/password` con Bearer; el login documenta `username` o `email`               |
| CA-42 | Cobertura global                                                                                                | ≥ 80 % en líneas, sentencias, funciones y ramas                                                                                                             |
| CA-43 | Admin lista usuarios con personal y clientes                                                                    | Cada cliente trae `email`, `fullName` y `phone` correctos; el personal trae los tres en `null`; todos tienen las mismas 8 claves; sin hashes ni contraseñas |
| CA-44 | Admin consulta `GET /users/:id` de un cliente y de un miembro del personal                                      | Datos de contacto del cliente / tres `null` en el personal                                                                                                  |
| CA-45 | Admin edita (`PATCH /users/:id`) a un cliente y a un miembro del personal                                       | La respuesta trae los mismos campos de contacto                                                                                                             |
| CA-46 | Operador, repartidor, cliente y petición sin sesión llaman `GET /users` y `GET /users/:id`                      | `403` los tres roles; `401` sin sesión                                                                                                                      |

## Trazabilidad (prevista)

| Criterio      | Prueba                                                                                |
| ------------- | ------------------------------------------------------------------------------------- |
| CA-01, CA-02  | `test/database/customers-migration.e2e-spec.ts`                                       |
| CA-03 a CA-07 | `test/database/customers.e2e-spec.ts`                                                 |
| CA-08 a CA-10 | `test/unit/phone.spec.ts` (normalización) y `customers.e2e-spec.ts` (contrato)        |
| CA-11, CA-12  | `test/database/customers.e2e-spec.ts`                                                 |
| CA-13, CA-14  | `test/database/customers-concurrency.e2e-spec.ts`                                     |
| CA-15 a CA-19 | `test/database/customer-login.e2e-spec.ts`; CA-18 con las suites existentes de `auth` |
| CA-20 a CA-25 | `test/database/customer-profile.e2e-spec.ts`                                          |
| CA-26 a CA-29 | `test/database/customer-roles.e2e-spec.ts`                                            |
| CA-30, CA-31  | `test/database/customer-throttle.e2e-spec.ts`                                         |
| CA-32 a CA-40 | `test/database/password-change.e2e-spec.ts`                                           |
| CA-41         | `test/swagger.e2e-spec.ts`                                                            |
| CA-42         | `npm run test:cov`                                                                    |
| CA-43 a CA-46 | `test/database/customers.e2e-spec.ts` y `test/unit/users-contract.spec.ts`            |
