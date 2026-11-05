# Especificación 006 — catálogo de productos

Fecha: 2026-10-08. Estado: cerrado en `feature-products`; catálogo aportado en `8699a2b` y `1d15709`, corregido en `815c649`, con 341 pruebas y CI success 37845481553. El usuario confirmó recorrido manual antes de autorizar 007. Los contratos se contrastaron con la entidad `Product` (restricciones `products_sku_format`, `products_name_nonempty`, `products_stock_nonnegative`) y con los SKU del seed (`INV-001` a `INV-003`, que cumplen el formato).

## Alcance y trazabilidad

Avanzar R-06 (funcionalidades) con las rutas reales de catálogo: HU-05 y HU-07 (parte de productos), RN-01, RN-02 y RN-05. Se reutilizan `AuthGuard`, `Roles` y `RolesGuard` del incremento 004/005. No se implementan movimientos, colección Postman, recuperación 2FA ni despliegue. El saldo se muestra pero solo cambia por movimientos (RN-02); este incremento nunca lo escribe.

## Contratos HTTP relativos a /api/v1

Todas las rutas requieren `AuthGuard`. Sesión ausente/incorrecta/revocada/vencida: 401. Un token de enrolamiento tampoco permite acceder.

| Método y ruta              | Acceso               | Entrada                                   | Respuesta exitosa                        |
| -------------------------- | -------------------- | ----------------------------------------- | ---------------------------------------- |
| POST /products             | Admin (403 operador) | JSON `{sku,name,description?}`            | 201 producto con stock 0                 |
| GET /products              | Admin u operador     | Query opcional `page,limit,search,active` | 200 `{data,page,limit,total,totalPages}` |
| GET /products/:id          | Admin u operador     | UUID v4                                   | 200 producto                             |
| PATCH /products/:id        | Admin (403 operador) | UUID v4 y JSON `{name?,description?}`     | 200 producto actualizado                 |
| PATCH /products/:id/status | Admin (403 operador) | UUID v4 y JSON `{active}` booleano        | 200 producto actualizado                 |

Producto expuesto: exactamente `{id,sku,name,description,active,stock,createdAt,updatedAt}`, con los mismos nombres de la entidad. `description` es `null` si no existe; fechas ISO-8601.

## Validaciones

- `sku`: obligatorio, canónico y sin transformación automática, regex `^[A-Z0-9][A-Z0-9._-]{0,47}$` (1–48 caracteres: mayúsculas, dígitos y `._-`), idéntica al CHECK `products_sku_format` y a `varchar(48)`. La API valida la misma regla para devolver 400 en vez de un error de BD. Los SKU del seed cumplen este formato. Decisión D-32: no se normaliza; un SKU en minúsculas recibe 400.
- `name`: obligatorio, string de 1–120 caracteres (`varchar(120)`) con al menos un carácter que no sea espacio, como exige `products_name_nonempty`. `description`: opcional, string de 1–500 caracteres; en PATCH, `null` la elimina. El límite de 500 es una decisión de la API: la columna es `text` sin tope en BD.
- El SKU es inmutable: PATCH no lo acepta. Cualquier campo extra (`sku`, `stock`, `active`, `id`, fechas) → 400. PATCH `/products/:id` con body vacío → 400.
- `/status`: `active` obligatorio y booleano estricto (no strings ni números).
- Paginación idéntica a 005: strings decimales sin signos, espacios, fracciones ni ceros iniciales; page 1–10000, limit 1–100; defaults 1 y 20; arrays o repetidos → 400. `totalPages = ceil(total/limit)`, 0 sin registros.
- `search`: opcional, 1–64 caracteres; coincidencia parcial sin distinguir mayúsculas en `sku` o `name`. Los comodines `%`, `_` y `\` se tratan como texto literal. `active`: solo los strings `true` o `false`.
- Listado ordenado por SKU ascendente e ID; página fuera del total → `data` vacía. Los productos inactivos aparecen salvo que `active=true`.
- UUID inválido, body/query inválido o campos no permitidos → 400. SKU duplicado → 409 sin detalles SQL. Producto inexistente → 404.
- Cambiar `status` al mismo valor es idempotente: 200 sin modificar `updatedAt`. Un PATCH de catálogo con los mismos valores tampoco lo modifica. Como `updatedAt` es una `UpdateDateColumn`, el servicio compara antes y no ejecuta el UPDATE cuando no hay cambios.

## Seguridad y concurrencia

- Dos creaciones simultáneas con el mismo SKU producen un 201 y un 409; el control lo da la restricción única de PostgreSQL, no una comprobación previa en la aplicación. Solo se convierte en 409 la violación de esa restricción; cualquier otro error no se enmascara.
- Las actualizaciones escriben únicamente las columnas de catálogo (`name`, `description`, `active`; `updatedAt` se actualiza solo) y nunca la columna `stock`, para que una edición concurrente no pise un movimiento futuro.
- Desactivar un producto conserva su historial y saldo (RN-05); el rechazo de movimientos sobre productos inactivos se implementa en el incremento de movimientos.
- Los permisos se evalúan con el rol vigente de la BD en cada petición (comportamiento de 004/005).
- Los errores no exponen SQL, nombres de constraints ni datos internos.

## Criterios de aceptación

- P-01: las cinco rutas devuelven 401 sin sesión; las tres de escritura devuelven 403 para operador; las dos de lectura funcionan para admin y operador. Un token de enrolamiento no sirve.
- P-02: admin crea un producto → 201, `stock` 0, `active` true, sin campos extra. SKU duplicado → 409 (escenario 5 de la 001).
- P-03: body/query/UUID inválidos y campos no permitidos (incluidos `stock`, `sku` y `active` en PATCH de catálogo) → 400; SKU fuera del formato (incluido uno de 49 caracteres) → 400.
- P-04: listado con defaults, paginación, orden, página vacía, `search` (incluidos comodines literales) y filtro `active` correctos; los productos del seed aparecen con sus saldos 20, 30 y 10.
- P-05: GET por ID devuelve producto y saldo; inexistente → 404.
- P-06: PATCH actualiza nombre/descripción; `/status` desactiva y reactiva. El saldo y el historial no cambian; operaciones idénticas son idempotentes.
- P-07: dos creaciones concurrentes con el mismo SKU → un 201 y un 409; un PATCH concurrente no altera el saldo.
- P-08: pruebas Jest unitarias y Supertest sobre PostgreSQL real; regresiones 001–005 pasan y las cuatro métricas globales permanecen >=80% sin excluir código.
- P-09: README (tabla de incrementos y rutas), decisiones, trazabilidad R-06 parcial, tareas y overview `docs/commits/006.md` actualizados antes del commit; push y CI verificados después.

## Fuera de alcance

> La eliminación física de productos sin movimientos se incorpora en [la especificación 011](../011-crud-completion/spec.md) (D-59).

Eliminación física de productos, edición del SKU, imágenes, categorías, precios, movimientos y cualquier escritura del saldo.

## Fuentes técnicas

- [TypeORM: QueryBuilder y paginación](https://typeorm.io/docs/query-builder/select-query-builder/).
- [PostgreSQL: restricciones únicas](https://www.postgresql.org/docs/16/ddl-constraints.html).
