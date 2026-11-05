# Especificación 007 — movimientos de inventario

Fecha: 2026-10-08. Estado: especificado antes del código e implementado/verificado localmente (439 pruebas en 17 suites y cobertura >=80%). Commit/push y CI posteriores se informan en el cierre. Rama `codex/feature-movements`, basada en `815c649` de `feature-products` (catálogo verificado). La rama requiere integrar catálogo antes o junto con movimientos; no se mezcla en main durante este incremento.

## Alcance

Completar HU-06 y la consulta de historial de HU-07: entradas/salidas auditables, saldo protegido y listado paginado. RN-02 a RN-05 y R-06 avanzan; R-06 sigue parcial hasta entregar Postman. Se reutilizan tablas/migraciones, guards y paginación existentes. No hay edición/eliminación de movimientos, nuevas dependencias, recuperación 2FA ni despliegue.

## Contratos HTTP relativos a /api/v1

Ambas rutas usan `AuthGuard` y `RolesGuard`, roles `admin` y `operador`. Ausencia, expiración, revocación o alteración del JWT → 401. Credenciales de enrolamiento/desafío no conceden acceso. Todas las respuestas llevan `Cache-Control: no-store`.

| Ruta              | Entrada                                    | Resultado                                                                          |
| ----------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `POST /movements` | JSON `{productId,type,quantity,reason}`    | 201 `{movement,stock}`: movimiento insertado y saldo resultante en esa transacción |
| `GET /movements`  | Query opcional `page,limit,productId,type` | 200 `{data,page,limit,total,totalPages}`                                           |

Movimiento público: exactamente `{id,productId,type,quantity,reason,user:{id,username},createdAt}`. Fecha ISO-8601. Responsable obtenido de la sesión, sin aceptar `userId`, stock, fechas o claves de seed del cliente. No se exponen contraseña, TOTP, sesión ni `seedKey`. El historial conserva registros de productos activos/inactivos, incluidos los del seed. No hay snapshot de stock ni rol en cada movimiento; `stock` es solo el saldo confirmado que devuelve POST y podría cambiar por operaciones posteriores.

## Validaciones y reglas

- `productId`: UUID v4, sin transformación. `type`: exactamente `IN` u `OUT`.
- `quantity`: número JSON entero, 1 a 2147483647 (rango de columna PostgreSQL integer); rechazar strings, booleanos, null, fracciones y valores fuera del rango con 400.
- `reason`: string de 1–300 caracteres, con al menos un carácter visible, sin NUL. Sin trim automático. Campos extra o faltantes → 400.
- Producto inexistente → 404. Producto inactivo → 409. Salida superior al saldo → 409; ninguna modificación de saldo/historial. Entrada que excede 2147483647 de saldo → 409 explícito, sin error SQL ni cambios.
- Creación: transacción que bloquea la fila de producto (`FOR UPDATE`), revalida la sesión después de esperar, comprueba reglas, actualiza solo stock y registra movimiento. Si falla cualquier paso se revierten ambos cambios. No pisa nombre, descripción ni estado del catálogo.
- Se admite consumir exactamente todo el saldo (queda 0). No hay claves de idempotencia: repetir POST válido representa otro movimiento; el cliente debe consultar el historial antes de reintentar una respuesta incierta.
- El cambio de estado del catálogo usa el mismo bloqueo de fila: si la desactivación se confirma primero, el movimiento en espera se rechaza. Si se confirma primero el movimiento, la desactivación conserva su historial/saldo.
- Paginación heredada: page 1–10000, limit 1–100, decimales canónicos; defaults 1/20; campos extra/repetidos/arrays → 400. Filtros: `productId` UUID v4, `type` IN/OUT; se pueden combinar. Producto sin registros/inexistente como filtro → lista vacía.
- Orden por createdAt descendente e ID descendente como desempate. Conteo y página se leen en una transacción REPEATABLE READ. Página fuera de rango → data vacía; totalPages 0 si no hay registros.

## Criterios de aceptación

- M-01: autenticación efectiva en ambas rutas; admin/operador pueden registrar/consultar y responsable coincide con sesión, sin secretos.
- M-02: entrada 10 y salida 4 producen saldo 6, dos movimientos persistidos y responsables correctos; consumo exacto deja 0.
- M-03: cantidad/UUID/tipo/motivo/body/query inválidos → 400; producto inexistente → 404; rechazos no escriben.
- M-04: saldo insuficiente, producto inactivo y overflow → 409, saldo/historial intactos. Un fallo real al insertar movimiento revierte el stock actualizado.
- M-05: dos salidas concurrentes de 4 con saldo 6 → un 201 y un 409, saldo 2 y solo un registro. Entradas concurrentes no pierden incrementos; productos diferentes funcionan independientemente.
- M-06: espera de bloqueo observable con PostgreSQL; sesión revocada/vencida durante espera → 401, desactivación confirmada durante espera → 409; edición concurrente conserva catálogo y stock.
- M-07: listado paginado, filtros, orden/desempate, historial de inactivos/seed y persistencia tras reiniciar; no PATCH/DELETE.
- M-08: checks, Jest/Supertest con PostgreSQL real y cobertura global >=80% en las cuatro métricas; todas las regresiones anteriores conservadas.
- M-09: README, decisiones, tareas, trazabilidad, guía manual y overview actualizados; commit/push autorizado y CI remoto verificado después de publicar.
