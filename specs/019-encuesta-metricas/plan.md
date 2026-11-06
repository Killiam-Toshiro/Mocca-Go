# Plan 019 — Encuesta de satisfacción y métricas

Fecha: 2026-11-05. Spec aprobada el mismo día.

## Enfoque

Una migración (`1791244809000-surveys`) y dos módulos nuevos: `src/surveys/` (responder y listar) y `src/metrics/` (informe del negocio). No se tocan los estados de los pedidos.

1. **Migración**: tabla `order_surveys` (una fila por pedido, `UNIQUE(order_id)`, calificación 1–5 y comentario de 1 a 300 caracteres con CHECK); claves foráneas `RESTRICT` hacia pedido y cliente. `down()` aborta si hay respuestas.
2. **`SurveysService.create`**: bloquea la fila del pedido, responde `404` si no es del cliente, `409` si no está `entregado` o ya tiene respuesta (también ante el choque de la restricción única en peticiones simultáneas).
3. **`SurveysService.list`**: consulta paginada para el admin, de la más reciente a la más antigua, con filtros por calificación y rango de fechas en hora de Colombia.
4. **Vista del pedido**: el campo `survey` (`{rating, comment, createdAt}` o `null`) se carga con la relación del pedido.
5. **`MetricsService.report`**: una sola transacción `REPEATABLE READ` para que todas las secciones vean los mismos datos; cada sección es una consulta agregada (`COUNT`, `SUM`, `percentile_cont`, `FILTER`). Los cálculos puros (periodo, redondeos, días vacíos) viven en `metrics.calc.ts`.
6. **Fechas**: ayudantes en `src/common/calendar-date.ts` para validar `YYYY-MM-DD` y convertir días de Colombia (UTC−5) a instantes.

## Piezas

| Archivo                                            | Contenido                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/database/migrations/1791244809000-surveys.ts` | Migración de `order_surveys`.                                              |
| `src/surveys/*`                                    | Entidad, DTOs, servicio, controlador (`GET /surveys`), respuestas Swagger. |
| `src/orders/orders.controller.ts`                  | `POST /orders/:id/survey` (solo `cliente`).                                |
| `src/metrics/*`                                    | DTO, servicio, cálculos puros, vista, respuestas y `GET /metrics`.         |
| `src/common/calendar-date.ts`                      | Validación y conversión de fechas de Colombia.                             |
| `src/common/database-errors.ts`                    | Restricciones de encuestas; borrar un cliente con encuestas da `409`.      |

## Decisiones técnicas

- **Venta = pago `aprobado`**: incluye `no_entregado`; un pedido cancelado (reembolsado) no cuenta.
- **Costo = el guardado en cada línea** (`order_items.unit_cost`), no el actual del producto.
- **Tiempos desde los eventos** (`order_events`): cocina = creación→`listo`; espera = `listo`→`en_camino`; reparto = `en_camino`→`entregado`. «A tiempo» mide el reparto contra 15 minutos.
- **Días de Colombia** con desfase fijo (−05:00, sin horario de verano).
- **Sin caché** (`no-store`) en `/metrics` y `/surveys`.
