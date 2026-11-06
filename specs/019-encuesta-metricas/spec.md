# Especificación 019 — Encuesta de satisfacción y métricas

Fecha: 2026-11-05. Estado: **pendiente de aprobación del usuario**. Rama prevista: `feature-metricas`.

## Contexto

Con el 018 el pedido ya recorre todo su ciclo (`recibido → en_preparacion → listo → en_camino → entregado | no_entregado`). Este incremento cierra el backend planeado: el cliente califica el pedido que recibió (la «encuesta corta después de entregar» del modelo de negocio) y el administrador consulta las métricas con las que el proyecto valida sus hipótesis: ventas y ticket, tiempos de despacho por zona, costo variable y margen, satisfacción y recompra.

## Alcance

1. Encuesta: el cliente califica de 1 a 5 un pedido `entregado` suyo, con un comentario opcional. Una sola respuesta por pedido.
2. El pedido muestra su encuesta (`survey`), para que el front sepa si debe pedirla.
3. Listado de respuestas para el administrador, con filtros.
4. Métricas para el administrador: ventas, tiempos de despacho, margen, satisfacción, recompra y resultado de los pedidos, con rango de fechas y filtro opcional por zona.

## Fuera de alcance

- Editar o borrar una respuesta; encuestar pedidos `no_entregado`; preguntas distintas de la calificación y el comentario.
- Métricas para `operador` o `repartidor`; exportar a CSV o PDF; gráficos (los dibuja el front).
- Metas configurables (por ejemplo «costo variable ≤ 39 %» o «≥ 90 % en ≤ 15 min»): el servidor entrega las cifras y el front las compara.
- Qué hacer con los pedidos `no_entregado` (se define en un incremento posterior).

## Vocabulario

- **Encuesta**: la respuesta de un cliente a un pedido: `rating` (1 a 5) y `comment` opcional.
- **Pedido vendido**: pedido con pago `aprobado` (es decir, no cancelado ni reembolsado). Incluye los pedidos en curso, los `entregado` y los `no_entregado` (la comida se preparó y no se reembolsa).
- **Periodo**: pedidos creados entre `from` y `to`, ambos días inclusive, en hora de Colombia (`America/Bogota`). Por defecto, los últimos 30 días.
- **Reparto**: tiempo entre que el pedido sale (`en_camino`) y se entrega. Es el mismo que promete la hora estimada de 15 minutos del 018.
- **Tiempo total**: tiempo entre que se crea el pedido y se entrega.

## Decisiones de diseño propuestas

1. **Una encuesta por pedido, inmutable.** La respuesta no se edita ni se borra; una segunda respuesta recibe `409`. Solo el cliente dueño de un pedido `entregado` puede responder.
2. **La encuesta viaja en el pedido.** `GET /orders` y `GET /orders/:id` suman `survey` (`null` si no hay respuesta). Así el front muestra «califica tu pedido» cuando el pedido está `entregado` y `survey` es `null`, sin una ruta extra de consulta.
3. **Una sola ruta de métricas** (`GET /metrics`), con secciones, en lugar de varias rutas: el panel del administrador carga todo con una petición y el mismo periodo y filtro valen para todas las cifras.
4. **«Vendido» = pago aprobado.** Los cancelados (reembolsados) no cuentan como venta; los `no_entregado` sí, porque el costo ya se incurrió y no hay reembolso (a la espera de la decisión posterior sobre ellos). Los ingresos, el ticket promedio y el costo variable usan esta misma base.
5. **Costo variable con el costo guardado en cada línea del pedido** (no el costo actual del producto), así el margen de un pedido pasado no cambia si el costo del producto cambia después.
6. **Tiempos solo de pedidos `entregado`**, calculados con los eventos del pedido (`order_events`): total (creación → entrega) y por etapa (cocina: `recibido` → `listo`; espera: `listo` → `en_camino`; reparto: `en_camino` → `entregado`). El porcentaje «a tiempo» mide el **reparto** contra los 15 minutos de la hora estimada del 018 (constante), por zona. Si prefieres que mida el tiempo total (creación → entrega), es un cambio de una línea; está marcado como decisión abierta abajo.
7. **Zona de un pedido** = la zona guardada en el pedido al crearlo (`zone_name`); el filtro `zoneId` usa la zona actual de su punto de entrega.
8. **Recompra dentro del periodo:** clientes con 2 o más pedidos vendidos en el periodo sobre los clientes con al menos uno.
9. **Solo `admin`** consulta métricas y el listado de respuestas, porque incluyen costos, márgenes y datos de clientes.

## Modelo de datos

Migración `1791244809000-surveys`.

### Tabla `order_surveys`

| Columna       | Tipo         | Regla                                                   |
| ------------- | ------------ | ------------------------------------------------------- |
| `id`          | uuid         | PK                                                      |
| `order_id`    | uuid         | FK a `orders`, `RESTRICT`; **UNIQUE** (una por pedido)  |
| `customer_id` | uuid         | FK a `users`, `RESTRICT`: quien responde                |
| `rating`      | smallint     | CHECK entre 1 y 5                                       |
| `comment`     | varchar(300) | Nulo o de 1 a 300 caracteres con algún carácter visible |
| `created_at`  | timestamptz  | Hora de la respuesta                                    |

Índice por `created_at` (listado y métricas). `down()` aborta si hay respuestas. La regla «solo un pedido `entregado` y propio» se aplica en el servicio, dentro de la transacción que bloquea el pedido.

## Reglas de negocio

- **RN-99 — Quién responde.** `POST /orders/:id/survey` es solo del rol `cliente`; el pedido debe ser suyo. Otro cliente o un pedido inexistente → `404`. Los demás roles → `403`; sin sesión `401`. La autorización va antes de cualquier otra validación.
- **RN-100 — Cuándo.** El pedido debe estar `entregado`; en otro estado → `409` indicando el estado actual.
- **RN-101 — Una sola vez.** Si el pedido ya tiene respuesta → `409`. Dos peticiones simultáneas: una `201` y la otra `409` (el pedido se bloquea y además existe el índice único).
- **RN-102 — Validación.** `rating` es un entero de 1 a 5 (obligatorio); `comment` es opcional, de 1 a 300 caracteres con algún carácter visible, sin carácter NUL; se guarda sin espacios sobrantes. No se admiten otros campos ni `null`. Errores de forma → `400`.
- **RN-103 — La encuesta en el pedido.** `survey` es `{ rating, comment, createdAt }` o `null`. Lo ven quienes ya ven el pedido (el cliente dueño, `admin` y `operador`).
- **RN-104 — Listado de respuestas.** `GET /surveys` (solo `admin`), paginado, la más reciente primero. Filtros: `rating` (1 a 5), `from` y `to` (fechas `YYYY-MM-DD`, hora de Colombia, ambos inclusive). Cada fila trae: `orderId`, `number`, `rating`, `comment`, `customer` (`name`), `zoneName`, `createdAt`.
- **RN-105 — Periodo y filtros de métricas.** `GET /metrics?from=&to=&zoneId=`. `from` y `to` son fechas `YYYY-MM-DD`; por defecto `to` es hoy y `from` es 29 días antes (30 días). `from` no puede ser posterior a `to` y el periodo no puede pasar de 366 días → `400`. `zoneId` (opcional, UUID) filtra por zona; si no existe → `404`. Los pedidos entran al periodo por su fecha de creación.
- **RN-106 — Ventas.** Sobre los pedidos vendidos del periodo: cantidad de pedidos, ingresos (suma de `total`), ticket promedio (ingresos ÷ pedidos, entero redondeado) y una serie diaria con ceros en los días sin ventas (`date`, `orders`, `revenue`).
- **RN-107 — Margen.** Sobre los pedidos vendidos: `revenue`, `variableCost` (suma de costo unitario × cantidad de cada línea), `margin` (ingresos − costo) y `variableCostRate` (costo ÷ ingresos, con 4 decimales; `null` si no hay ingresos). Desglose por categoría de producto con los mismos campos (`revenue` = suma de `lineTotal` de la categoría).
- **RN-108 — Tiempos.** Sobre los pedidos `entregado` del periodo: `delivered` (cantidad) y, en minutos con 1 decimal (`null` si no hay pedidos), el promedio, la mediana y el percentil 90 del **tiempo total**, más el promedio de cada **etapa** (cocina, espera y reparto). `onTimeRate`: proporción de entregas con reparto de 15 minutos o menos (4 decimales; `null` sin pedidos). Todo también desglosado por zona (`zoneName`), ordenado por nombre.
- **RN-109 — Satisfacción.** Sobre las respuestas cuyo pedido está en el periodo: `responses`, `average` (1 decimal; `null` sin respuestas), `distribution` (cantidad por cada calificación de 1 a 5, con ceros) y `responseRate` (respuestas ÷ pedidos entregados; `null` si no hay entregados).
- **RN-110 — Recompra.** `customers` (con al menos un pedido vendido en el periodo), `repeatCustomers` (con 2 o más) y `repeatRate` (4 decimales; `null` sin clientes).
- **RN-111 — Resultado de los pedidos.** Cantidad de pedidos creados en el periodo por estado final o actual: `entregado`, `no_entregado`, `cancelado` y `enCurso` (`recibido`, `en_preparacion`, `listo`, `en_camino`).
- **RN-112 — Consistencia.** Todas las secciones se calculan en una sola transacción de lectura (`REPEATABLE READ`), de modo que las cifras sean coherentes entre sí.
- **RN-113 — Acceso a métricas.** Solo `admin`; `operador`, `repartidor` y `cliente` → `403`; sin sesión `401`.
- **RN-114 — Cabeceras.** `Cache-Control: no-store` en `/metrics` y `/surveys` (y ya en `/orders`).
- **RN-115 — Errores.** Orden: `401 → 403 → 400 → 404 → 409`.

## Contratos

### `POST /orders/:id/survey` (cliente)

Cuerpo: `{ "rating": 5, "comment": "Llegó caliente y rápido" }` → `201`:

```json
{
  "orderId": "…",
  "rating": 5,
  "comment": "Llegó caliente y rápido",
  "createdAt": "2026-11-05T21:10:00.000Z"
}
```

### `GET /surveys?page=&limit=&rating=&from=&to=` (admin) → `200` paginado

### `GET /metrics?from=&to=&zoneId=` (admin) → `200`

```json
{
  "period": {
    "from": "2026-10-07",
    "to": "2026-11-05",
    "days": 30,
    "zoneId": null
  },
  "sales": {
    "orders": 120,
    "revenue": 1044000,
    "averageTicket": 8700,
    "daily": [{ "date": "2026-10-07", "orders": 4, "revenue": 34800 }]
  },
  "margin": {
    "revenue": 1044000,
    "variableCost": 410000,
    "margin": 634000,
    "variableCostRate": 0.3927,
    "byCategory": [
      {
        "category": "cafe",
        "revenue": 500000,
        "variableCost": 150000,
        "margin": 350000,
        "variableCostRate": 0.3
      }
    ]
  },
  "delivery": {
    "delivered": 100,
    "onTimeThresholdMinutes": 15,
    "onTimeRate": 0.91,
    "totalMinutes": { "average": 21.4, "median": 20.0, "p90": 29.5 },
    "stageMinutes": { "kitchen": 8.1, "waiting": 4.2, "delivery": 9.1 },
    "byZone": [
      {
        "zoneName": "Zona 1",
        "delivered": 40,
        "onTimeRate": 0.93,
        "totalMinutes": { "average": 20.0, "median": 19.0, "p90": 27.0 },
        "stageMinutes": { "kitchen": 8.0, "waiting": 3.9, "delivery": 8.1 }
      }
    ]
  },
  "satisfaction": {
    "responses": 70,
    "average": 4.4,
    "responseRate": 0.7,
    "distribution": { "1": 1, "2": 2, "3": 6, "4": 20, "5": 41 }
  },
  "retention": { "customers": 60, "repeatCustomers": 49, "repeatRate": 0.8167 },
  "outcomes": {
    "entregado": 100,
    "no_entregado": 3,
    "cancelado": 6,
    "enCurso": 5
  }
}
```

Operaciones nuevas (3): `POST /orders/{id}/survey`, `GET /surveys`, `GET /metrics`. Total: 53.

## Decisiones abiertas para tu revisión

1. **Qué mide «a tiempo»:** el **reparto** (salida → entrega) contra los 15 minutos de la hora estimada, o el **tiempo total** (creación → entrega). Propongo el reparto porque es la promesa que ve el cliente; tus documentos hablan de «despacho ≤ 15 min».
2. **Los `no_entregado` cuentan como venta** (hay costo y no hay reembolso). Si prefieres excluirlos hasta decidir qué hacer con ellos, los ingresos bajan pero el margen deja de incluir comida preparada y no entregada.
3. **Los días y el periodo** se calculan en hora de Colombia (UTC−5, sin horario de verano).

## Criterios de aceptación

| ID    | Escenario                                                                                                 | Resultado                                                                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| CA-01 | Aplicar y revertir la migración                                                                           | Crea `order_surveys`; `down()` aborta si hay respuestas y, sin ellas, deja el esquema anterior                                      |
| CA-02 | Violar restricciones directamente en la base                                                              | Rechaza `rating` fuera de 1–5, comentario vacío o de más de 300 caracteres y una segunda respuesta del mismo pedido                 |
| CA-03 | El cliente responde su pedido `entregado`                                                                 | `201`; el pedido muestra `survey` con la calificación y el comentario                                                               |
| CA-04 | Responder un pedido que no está `entregado` (en cualquier otro estado)                                    | `409` indicando el estado; no se guarda nada                                                                                        |
| CA-05 | Responder dos veces el mismo pedido, también en paralelo                                                  | La segunda `409`; en paralelo una `201` y el resto `409`; una sola fila                                                             |
| CA-06 | Pedido ajeno o inexistente                                                                                | `404`                                                                                                                               |
| CA-07 | Cuerpo inválido: sin `rating`, 0, 6, decimal, texto, comentario vacío o de 301, `null`, NUL, campos extra | `400`; no se guarda nada                                                                                                            |
| CA-08 | Roles distintos de cliente responden; sin sesión                                                          | `403` / `401`                                                                                                                       |
| CA-09 | `survey` en el pedido                                                                                     | `null` antes de responder; el objeto después; lo ven el cliente dueño, `admin` y `operador`                                         |
| CA-10 | `GET /surveys` con filtros y paginación                                                                   | Solo `admin`; la más reciente primero; filtros `rating`, `from`, `to`; `400` con valores inválidos; `403` / `401` en otros casos    |
| CA-11 | Métricas de ventas con pedidos entregados, cancelados, `no_entregado` y en curso                          | Pedidos, ingresos, ticket y serie diaria con ceros; los cancelados (reembolsados) no cuentan                                        |
| CA-12 | Margen con costos guardados distintos del costo actual del producto                                       | Usa el costo guardado en la línea; desglose por categoría; `variableCostRate` `null` sin ingresos                                   |
| CA-13 | Tiempos con eventos de fechas conocidas                                                                   | Total (promedio, mediana, p90), etapas, `onTimeRate` y desglose por zona con los valores esperados; `null` sin entregas             |
| CA-14 | Satisfacción y recompra                                                                                   | Respuestas, promedio, distribución con ceros, tasa de respuesta, clientes, recompradores y tasa                                     |
| CA-15 | Resultado de los pedidos                                                                                  | Cantidades por `entregado`, `no_entregado`, `cancelado` y `enCurso`                                                                 |
| CA-16 | Periodo y zona                                                                                            | Por defecto 30 días; `from` > `to` o más de 366 días → `400`; fechas mal formadas → `400`; zona inexistente → `404`; la zona filtra |
| CA-17 | Día de la medianoche de Colombia                                                                          | Un pedido a las 23:30 hora de Colombia cuenta en su día, no en el siguiente en UTC                                                  |
| CA-18 | Acceso a `/metrics`                                                                                       | Solo `admin` `200`; `operador`, `repartidor`, `cliente` `403`; sin sesión `401`; `Cache-Control: no-store`                          |
| CA-19 | Eliminar un cliente con encuestas                                                                         | `409` (no `500`)                                                                                                                    |
| CA-20 | Swagger JSON                                                                                              | Exactamente 53 operaciones; esquemas de `survey`, `metrics` y errores documentados                                                  |
| CA-21 | Cobertura global                                                                                          | ≥ 80 % en líneas, sentencias, funciones y ramas                                                                                     |

## Trazabilidad (prevista)

| Criterio             | Prueba                                                                            |
| -------------------- | --------------------------------------------------------------------------------- |
| CA-01, CA-02         | `test/database/surveys-migration.e2e-spec.ts`                                     |
| CA-03 a CA-09, CA-19 | `test/database/surveys.e2e-spec.ts`                                               |
| CA-10                | `test/database/surveys-list.e2e-spec.ts`                                          |
| CA-11 a CA-18        | `test/database/metrics.e2e-spec.ts` (con pedidos sembrados en la base)            |
| CA-20                | `test/swagger.e2e-spec.ts`                                                        |
| Funciones puras      | `test/unit/metrics-calculations.spec.ts` (periodo, redondeos, percentiles, tasas) |
