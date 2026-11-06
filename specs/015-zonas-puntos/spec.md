# Especificación 015 — Zonas y puntos de entrega

Fecha: 2026-11-05. Estado: **aprobada por el usuario (2026-11-05)** con los pisos e indicaciones de abajo. Rama prevista: `feature-zonas`.

## Contexto

Mocca Go entrega en el campus de Icesi. La entrega es en **puntos fijos**: el cliente indica en qué lugar del campus está (edificio A, Biblioteca, Canchas…), en qué piso y una indicación de texto, y el repartidor sube hasta ese piso y entrega en el pasillo principal. Para repartir varios pedidos en un solo recorrido, los lugares se agrupan en **zonas** de lugares cercanos entre sí. Una ronda de despacho (018) llevará pedidos de una sola zona y hasta 5 pedidos.

Este incremento crea el catálogo de zonas y puntos y su administración. Los pedidos (016) lo consumirán al elegir el punto de entrega.

## Vocabulario

- **Zona**: grupo de despacho (Zona 1 a Zona 4). El cliente no la elige; se deduce del punto.
- **Punto**: lugar concreto del campus donde se entrega (un edificio, la Biblioteca, las Canchas). Pertenece a una sola zona.
- **Piso** e **indicación**: datos que el cliente da en cada pedido (016); aquí solo se define cuántos pisos tiene cada punto.

## Alcance

1. Zonas y puntos con su administración (solo `admin`).
2. Número de pisos por punto (opcional) para validar el piso que elija el cliente.
3. Consulta pública `GET /delivery-zones`: zonas activas con sus puntos activos, para que el cliente elija sin sesión.
4. Seed con las 4 zonas y los 17 puntos del campus.

Rutas relativas a `/api/v1`. Pasa de 26 a **34 operaciones** (ver Contratos). Sin dependencias ni variables de entorno nuevas.

Fuera de alcance:

- Elegir punto, piso e indicación en un pedido, y validar el piso contra el punto (016).
- Agrupar pedidos en rondas, asignar repartidor y el máximo de 5 pedidos por ronda (018). Este incremento solo deja listo el agrupamiento por zona.
- Notificaciones («tu pedido va en camino, llega en unos 15 min») y teléfono del personal: llegan con el seguimiento de pedidos (016/017) y se definen allí (ver Decisiones confirmadas).
- Horarios por punto, costo de domicilio, coordenadas y mapas.

## Modelo de datos

`delivery_zones`:

| Columna                     | Tipo        | Regla                                        |
| --------------------------- | ----------- | -------------------------------------------- |
| `id`                        | uuid        | PK                                           |
| `name`                      | varchar(60) | Obligatorio, único sin distinguir mayúsculas |
| `active`                    | boolean     | Por defecto `true`                           |
| `created_at` / `updated_at` | timestamptz | Como el resto de tablas                      |

`delivery_points`:

| Columna                     | Tipo         | Regla                                                                             |
| --------------------------- | ------------ | --------------------------------------------------------------------------------- |
| `id`                        | uuid         | PK                                                                                |
| `zone_id`                   | uuid         | FK a `delivery_zones`, `ON DELETE RESTRICT`                                       |
| `name`                      | varchar(80)  | Obligatorio, único sin distinguir mayúsculas                                      |
| `hint`                      | varchar(200) | Indicación de texto opcional («frente a la cafetería, entrada principal»)         |
| `floors`                    | smallint     | Número de pisos de 1 a 30, o `NULL` si el lugar no tiene pisos (canchas, coliseo) |
| `active`                    | boolean      | Por defecto `true`                                                                |
| `created_at` / `updated_at` | timestamptz  | Como el resto de tablas                                                           |

## Reglas de negocio

- **RN-41 — Zonas.** Nombre de 1 a 60 caracteres con algún carácter visible, único sin distinguir mayúsculas (`409` si se repite). Una zona se crea activa. Se puede renombrar y activar o desactivar.
- **RN-42 — Puntos.** Nombre de 1 a 80 caracteres, único sin distinguir mayúsculas en todo el campus. Cada punto pertenece a una zona **activa o inactiva** existente; se puede mover a otra zona con `PATCH`. `hint` es opcional (1 a 200 caracteres; `null` la borra). `floors` es opcional (1 a 30; `null` significa «sin pisos»).
- **RN-43 — Desactivar.** Una zona o un punto inactivo deja de ofrecerse en `GET /delivery-zones`; no afecta a pedidos ya creados (016 conservará el punto elegido). Desactivar una zona oculta todos sus puntos al cliente sin cambiar su propio estado.
- **RN-44 — Eliminar.** Una zona solo se elimina si no tiene puntos (`409` si los tiene). Un punto se elimina mientras ningún pedido lo haya usado; desde 016 la FK `RESTRICT` responderá `409` y se desactiva en su lugar.
- **RN-45 — Consulta pública.** `GET /delivery-zones` no exige sesión, devuelve solo zonas activas con al menos un punto activo, ordenadas por nombre de zona y luego por nombre de punto, y lleva `Cache-Control: no-store`. Admite 60 peticiones por minuto por IP, igual que el menú.
- **RN-46 — Consulta de administración.** `GET /delivery-zones/all` (solo `admin`) devuelve todas las zonas con todos sus puntos y sus estados, incluidos los inactivos y las zonas vacías.
- **RN-47 — Solo admin escribe.** Crear, editar, mover, activar, desactivar y eliminar: solo `admin`. Los demás roles reciben `403` y sin sesión `401`.
- **RN-48 — Máximo por ronda.** El máximo de pedidos por ronda de despacho es 5 y se define como constante de configuración en el incremento 018; este incremento no lo aplica.

## Contratos

### `GET /delivery-zones` (público)

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Zona 1",
      "points": [
        {
          "id": "uuid",
          "name": "Edificio A",
          "hint": null,
          "floors": 4
        }
      ]
    }
  ]
}
```

### `GET /delivery-zones/all` (admin)

Igual, pero cada zona y cada punto incluyen `active`, `createdAt` y `updatedAt`, y los puntos incluyen `zoneId`.

### Zonas (admin)

- `POST /delivery-zones` con `{ "name" }` → `201` con la zona.
- `PATCH /delivery-zones/:id` con `name` y/o `active` (al menos uno) → `200`. Repetir valores no modifica `updatedAt`.
- `DELETE /delivery-zones/:id` → `204`; `409` si tiene puntos.

### Puntos (admin)

- `POST /delivery-points` con `{ "zoneId", "name", "hint?", "floors?" }` → `201`.
- `PATCH /delivery-points/:id` con `zoneId`, `name`, `hint`, `floors` y/o `active` (al menos uno) → `200`.
- `DELETE /delivery-points/:id` → `204`.

Errores comunes: `401 → 403 → 400 → 404 → 409`. Un `zoneId` inexistente en un punto responde `404`.

Operaciones nuevas (8): `GET /delivery-zones`, `GET /delivery-zones/all`, `POST` y `PATCH` y `DELETE /delivery-zones`, `POST` y `PATCH` y `DELETE /delivery-points`.

## Datos de partida (seed)

Zonas, puntos, pisos e indicaciones confirmados por el usuario el 2026-11-05. Un punto «sin pisos» se entrega en el lugar y no pide piso. Las indicaciones se guardan en `hint` y el admin puede cambiarlas por API.

| Zona   | Puntos (pisos; indicación)                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Zona 1 | Edificio M (4), Edificio A (2), Auditorios (1; «Se entrega en la plazoleta de auditorios»), Central (1), Biblioteca (1; «Solo se entrega en el primer piso»), Zona Samán (sin pisos) |
| Zona 2 | Edificio C (3), Edificio D (4), Edificio E (5), Bienestar Universitario (1; «Se entrega en el primer piso»)                                                                          |
| Zona 3 | Edificio G (1), Edificio L (5), Canchas (sin pisos)                                                                                                                                  |
| Zona 4 | Bloque F (1), Bloque H (1), Gym (sin pisos; «Se entrega afuera del gym»), Coliseo (sin pisos)                                                                                        |

Son 4 zonas y 17 puntos. El seed es idempotente: no repite zonas ni puntos con el mismo nombre y no toca los que el admin haya editado.

## Decisiones confirmadas por el usuario

1. Entrega en puntos fijos del campus; el cliente elige punto, piso e indicación de texto, y el repartidor sube hasta el piso y entrega en el pasillo principal.
2. Cuatro zonas de despacho con los puntos de la tabla anterior; un punto sin pisos (canchas, coliseo, plazoleta de auditorios, Zona Samán) se entrega en el lugar.
3. Sin horarios por punto y sin costo de domicilio. Solo el admin administra. Máximo 5 pedidos por ronda (aplica en 018).
4. Aviso de «en camino»: primero estado y hora estimada (unos 15 minutos) dentro de la app y un botón del repartidor que abre WhatsApp con el mensaje armado; el envío automático real queda para después (016/017).
5. Teléfono opcional del personal (lo carga el admin), para mostrárselo al cliente: se agrega más adelante, en el incremento de seguimiento de pedidos (016), no en este.
6. El cliente da una indicación de texto por pedido además de la del punto.

## Criterios de aceptación

| ID    | Escenario                                                                              | Resultado                                                                                                                                  |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| CA-01 | Aplicar y revertir la migración                                                        | Crea ambas tablas con sus restricciones; `down()` aborta si hay datos y, vacía, las elimina                                                |
| CA-02 | Insertar filas que violan restricciones                                                | Rechaza nombre vacío o repetido (sin distinguir mayúsculas), `floors` 0 o 31 y zona inexistente                                            |
| CA-03 | Admin crea una zona                                                                    | `201`, activa; nombre repetido (también en otra capitalización) `409`; nombre vacío o muy largo `400`                                      |
| CA-04 | Admin edita una zona                                                                   | `200`; repetir valores no cambia `updatedAt`; cuerpo vacío o con campos extra `400`; inexistente `404`                                     |
| CA-05 | Admin elimina una zona con y sin puntos                                                | `409` con puntos; `204` sin ellos                                                                                                          |
| CA-06 | Admin crea un punto con y sin `hint` y `floors`                                        | `201`; `floors` 0, 31 o decimal `400`; zona inexistente `404`; nombre repetido `409`                                                       |
| CA-07 | Admin edita, mueve de zona, activa y desactiva un punto; `hint: null` y `floors: null` | `200` con los valores nuevos; repetir valores no cambia `updatedAt`; objeto vacío `400`                                                    |
| CA-08 | Admin elimina un punto                                                                 | `204`; luego `404`                                                                                                                         |
| CA-09 | Operador, repartidor y cliente intentan escribir; sin sesión                           | `403` y `401`, sin cambios; la autorización se resuelve antes de validar el cuerpo                                                         |
| CA-10 | `GET /delivery-zones` sin sesión                                                       | `200`, `no-store`; solo zonas y puntos activos; zonas sin puntos activos omitidas; orden por nombre                                        |
| CA-11 | Claves del resultado público                                                           | Zona: `id, name, points`; punto: `id, name, hint, floors`; nunca `active`, fechas ni `zoneId`                                              |
| CA-12 | Desactivar un punto o toda una zona                                                    | Desaparece de la consulta pública en la siguiente petición y sigue en `/all`                                                               |
| CA-13 | `GET /delivery-zones/all` con admin, y con otros roles                                 | `200` con inactivos y zonas vacías, con `active` y fechas; `403` y `401` para el resto                                                     |
| CA-14 | Límite de peticiones de la consulta pública                                            | `429` tras 60 por minuto por IP                                                                                                            |
| CA-15 | Dos peticiones simultáneas: crear un punto en una zona y eliminar esa zona             | Nunca queda un punto huérfano ni un `500`: gana una y la otra recibe `404` o `409`                                                         |
| CA-16 | `npm run seed` dos veces sobre una base limpia                                         | Crea 4 zonas y 17 puntos con la tabla (pisos e indicaciones incluidos); la segunda vez no crea nada y respeta lo que el admin haya editado |
| CA-17 | Swagger JSON                                                                           | Exactamente 34 operaciones; `GET /delivery-zones` sin seguridad; las rutas de escritura documentan `403`                                   |
| CA-18 | Cobertura global                                                                       | ≥ 80 % en líneas, sentencias, funciones y ramas                                                                                            |

## Trazabilidad (prevista)

| Criterio      | Prueba                                         |
| ------------- | ---------------------------------------------- |
| CA-01, CA-02  | `test/database/delivery-migration.e2e-spec.ts` |
| CA-03 a CA-09 | `test/database/delivery.e2e-spec.ts`           |
| CA-10 a CA-14 | `test/database/delivery-public.e2e-spec.ts`    |
| CA-15         | `test/database/delivery.e2e-spec.ts`           |
| CA-16         | `test/database/seed.e2e-spec.ts`               |
| CA-17         | `test/swagger.e2e-spec.ts`                     |
| CA-18         | `npm run test:cov`                             |
