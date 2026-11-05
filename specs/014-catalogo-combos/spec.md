# Especificación 014 — Catálogo ampliado y combos

Fecha: 2026-11-05. Estado: **aprobada por el usuario (2026-11-05)** con categorías propias y un menú nuevo; el inventario de ejemplo anterior se elimina. Rama: `feature-catalogo`.

## Contexto

Hoy `products` es el catálogo del taller de inventario: SKU, nombre, descripción, estado activo y saldo. Mocca Go necesita un **menú vendible**: cada producto con precio, costo, categoría y un interruptor «agotado» que la cocina cambie en segundos, y **combos** (el Combo Clásico, el Combo Estudio…) formados por productos simples. Vender un combo descontará el saldo de sus componentes; eso lo hará el módulo de pedidos (016). Este incremento deja listo el catálogo que ese módulo consumirá.

Las cifras de negocio salen de los documentos del proyecto: ticket promedio de $8.500 COP, costo variable ponderado del menú ≤ 39 % y «agotado» visible en menos de 15 segundos.

## Alcance

1. **Productos ampliados**: `category`, `price`, `cost` y `soldOut`, más los valores calculados `available` y `costPercent`.
2. **Combos**: un producto de categoría `combo` con componentes (otros productos y una cantidad cada uno). No tiene saldo propio.
3. **Interruptor «agotado»** (`PATCH /products/:id/sold-out`) para admin y operador (cocina).
4. **Menú público** (`GET /menu`) para que el cliente vea precios y disponibilidad sin ver costos ni saldos.
5. **Seed** con un menú de ejemplo de Mocca Go (reemplaza el inventario de teclados y monitores).

Rutas relativas a `/api/v1`. Pasa de 23 a **26 operaciones**: `GET /menu`, `PATCH /products/:id/sold-out` y `PUT /products/:id/components`. Sin dependencias ni variables de entorno nuevas.

Fuera de alcance:

- Descontar saldo al vender, reservas de stock y pedidos (016).
- Imágenes de producto, opciones o modificadores (tamaño, leche, azúcar) y descuentos.
- Combos dentro de combos, combos con opciones a elegir y precios que varían por franja horaria.
- Categorías administrables por la API: es una lista fija (RN-28).
- Migrar o conservar el inventario de ejemplo del taller (teclados, mouse, monitor): se descarta, y la base de desarrollo se recrea (ver RN-39).
- Insumos (leche, café en grano, vasos): el saldo es de producto terminado; el modelo de recetas queda para después si hace falta.

## Modelo de datos

`products` conserva sus columnas y agrega:

| Columna    | Tipo        | Regla                                                                                                           |
| ---------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `category` | varchar(16) | CHECK ∈ {`cafe`, `bebida`, `panaderia`, `pasteleria`, `snack`, `combo`}; por defecto `snack` (filas anteriores) |
| `price`    | integer     | Pesos COP, CHECK 0 a 1.000.000; por defecto 0 (filas anteriores; una fila a 0 nunca está disponible)            |
| `cost`     | integer     | Costo variable unitario en pesos COP, CHECK 0 a 1.000.000; por defecto 0. Los combos lo ignoran (se calcula)    |
| `sold_out` | boolean     | Interruptor manual «agotado»; por defecto `false`                                                               |

Restricción adicional: `category <> 'combo' OR stock = 0` (un combo no tiene saldo propio).

`product_components` (nueva): `combo_id` (FK a `products`, `ON DELETE CASCADE`), `component_id` (FK a `products`, `ON DELETE RESTRICT`), `quantity` (entero 1 a 10), clave primaria `(combo_id, component_id)` y CHECK `combo_id <> component_id`.

Que solo los combos tengan componentes y que un combo no contenga combos son reglas entre filas: las verifica el servicio dentro de la transacción (RN-30) y las pruebas las cubren.

## Reglas de negocio

- **RN-28 — Categorías.** `cafe`, `bebida`, `panaderia`, `pasteleria`, `snack` y `combo`. `combo` identifica a los combos y solo ellos la usan. Un producto no se convierte en combo ni a la inversa; entre las cinco categorías simples sí puede cambiar.
- **RN-29 — Precio y costo.** Enteros en pesos COP. Al crear o editar: `price` de 1 a 1.000.000 y `cost` de 0 a 1.000.000. El costo puede superar al precio (un producto con pérdida es un dato válido, y `costPercent` lo hará visible).
- **RN-30 — Composición de un combo.** Entre 2 y 10 componentes, sin repetir producto, cada uno con cantidad de 1 a 10. Cada componente debe existir, estar **activo** al momento de guardar y **no ser un combo**. Los errores de composición responden `400` con el motivo.
- **RN-31 — Un combo no tiene saldo propio.** `stock` en BD vale siempre 0 y `POST /movements` sobre un combo responde `409 "Un combo no tiene saldo propio; registra el movimiento de sus componentes."` (después de `404` y antes del resto de reglas de movimientos). En las respuestas, el `stock` de un combo es **calculado**: cuántos combos completos alcanzan con el saldo actual, `min(⌊saldo del componente ÷ cantidad⌋)`.
- **RN-32 — Costo y porcentaje.** El `cost` de un combo es la suma de `cost × cantidad` de sus componentes; no se envía (si se envía, `400`). `costPercent` = `cost ÷ price × 100` redondeado a un decimal, o `null` si el precio es 0. Sirve para vigilar la meta de costo variable ≤ 39 %.
- **RN-33 — «Agotado» y disponibilidad.** `soldOut` es el interruptor manual de la cocina. `available` (calculado, no editable) es verdadero solo si el producto está activo, `soldOut` es falso, `price > 0` y además:
  - producto simple: `stock ≥ 1`;
  - combo: tiene componentes y cada componente está activo, no está marcado `soldOut` y su saldo cubre la cantidad que usa el combo.
    El módulo de pedidos (016) exigirá `available` para vender. Marcar un componente como agotado hace que sus combos queden no disponibles sin tocarlos.
- **RN-34 — Quién cambia qué.** Crear, editar precio, costo, categoría y componentes, activar/desactivar y eliminar: solo `admin` (como hasta ahora). Cambiar `soldOut`: `admin` y `operador`.
- **RN-35 — Eliminar y desactivar.** Un producto que es componente de algún combo no se elimina (`409 "El producto es componente de un combo."`); sí se puede desactivar, y entonces sus combos dejan de estar disponibles. Eliminar un combo (sin movimientos por RN-31) borra su composición. Las demás reglas de eliminación (RN-08) no cambian.
- **RN-36 — Lectura del catálogo.** `GET /products` y `GET /products/:id` pasan a ser **solo `admin` y `operador`**: incluyen saldo, costo y estado, datos internos. `repartidor` y `cliente` reciben `403`. Lo que ve un cliente es `GET /menu` (RN-37). Esto modifica el RN-15 del incremento 012.
- **RN-37 — Menú público.** `GET /menu` no exige sesión (el cliente decide antes de registrarse; ayuda a la conversión del QR). Devuelve solo productos **activos**, con `available` incluido, ordenados por categoría (`combo`, `cafe`, `bebida`, `panaderia`, `pasteleria`, `snack`) y luego por nombre. No devuelve `cost`, `costPercent`, `stock`, `active` ni `soldOut`. No se pagina: el menú es corto (máx. 200 productos activos; con más, `GET /menu` seguiría respondiendo los primeros 200 y se revisaría el diseño).
- **RN-38 — Frescura.** Las respuestas de `/menu` y de `/products` llevan `Cache-Control: no-store`, para que el «agotado» se vea en el cliente en menos de 15 segundos sin cachés intermedias.
- **RN-39 — Seed y base de desarrollo.** El seed crea el menú de la sección siguiente con saldo inicial por movimientos `IN`; es idempotente y no toca productos existentes. El inventario de ejemplo del taller (`INV-001` a `INV-003`) se elimina del seed. En una base ya creada esos productos tienen movimientos inmutables (RN-03) y no se pueden borrar por la API, así que la base de desarrollo se recrea: `docker compose down -v`, `npm run db:up`, `npm run migration:run` y `npm run seed`.

## Contratos

### Producto (respuesta de `/products`, solo admin y operador)

```json
{
  "id": "uuid",
  "sku": "CMB-ESTUDIO",
  "name": "Combo Estudio",
  "description": "Capuchino y croissant",
  "category": "combo",
  "price": 8500,
  "cost": 3100,
  "costPercent": 36.5,
  "soldOut": false,
  "available": true,
  "active": true,
  "stock": 12,
  "components": [
    {
      "productId": "uuid",
      "sku": "CAF-CAPU",
      "name": "Capuchino",
      "quantity": 1
    },
    {
      "productId": "uuid",
      "sku": "PAN-CROI",
      "name": "Croissant",
      "quantity": 1
    }
  ],
  "createdAt": "…",
  "updatedAt": "…"
}
```

`components` es `[]` en los productos simples. En un combo, `cost` y `stock` son calculados (RN-31, RN-32).

### `POST /products` (solo admin)

Cuerpo: `sku`, `name`, `description?`, `category` (obligatoria), `price` (obligatorio) y, según el tipo:

- simple (`cafe`, `bebida`, `panaderia`, `pasteleria`, `snack`): `cost` obligatorio; `components` no se admite (`400`);
- combo (`combo`): `components: [{ "productId", "quantity" }]` obligatorio (RN-30); `cost` no se admite (`400`).

Nace activo, con `soldOut: false` y saldo 0. Errores: `401 → 403 → 400 → 409` (SKU repetido).

### `PATCH /products/:id` (solo admin)

Acepta `name`, `description`, `category`, `price` y `cost` (al menos uno). `cost` en un combo → `400`; `category` hacia o desde `combo` → `400` (RN-28). Repetir los valores actuales no modifica `updatedAt`. No toca SKU, estado, `soldOut`, saldo ni componentes.

### `PUT /products/:id/components` (solo admin)

Cuerpo `{ "components": [{ "productId", "quantity" }] }`: reemplaza toda la composición en una transacción (RN-30). Sobre un producto que no es combo → `409 "El producto no es un combo."`. Si la nueva composición es inválida, la anterior se conserva. Errores: `401 → 403 → 400 → 404 → 409`. Responde `200` con el producto completo.

### `PATCH /products/:id/sold-out` (admin y operador)

Cuerpo `{ "soldOut": true }`. Idempotente. Responde `200` con el producto completo (la cocina ve al instante el `available` resultante). Errores: `401 → 403 → 400 → 404`.

### `GET /products` y `GET /products/:id` (admin y operador, RN-36)

Igual que hoy más el filtro opcional `category` (una de las seis; otro valor → `400`) además de `search` y `active`. Orden y paginación sin cambios.

### `GET /menu` (público)

```json
{
  "data": [
    {
      "id": "uuid",
      "sku": "CMB-ESTUDIO",
      "name": "Combo Estudio",
      "description": "Capuchino y croissant",
      "category": "combo",
      "price": 8500,
      "available": true,
      "components": [
        { "name": "Capuchino", "quantity": 1 },
        { "name": "Croissant", "quantity": 1 }
      ]
    }
  ]
}
```

### Menú del seed

Precios y costos en pesos COP; son datos de partida que el equipo puede ajustar en `src/seed/seed.ts`. Los 20 productos simples tienen saldo inicial por movimientos `IN`; los combos no tienen movimientos. Dejé tres combos, como en la prueba del Prototipo 6, y todos quedan por debajo del 39 % de costo variable.

| SKU           | Producto                                      | Categoría    | Precio | Costo          | Saldo     |
| ------------- | --------------------------------------------- | ------------ | ------ | -------------- | --------- |
| `CAF-AMER`    | Americano (caliente)                          | `cafe`       | 3.500  | 1.000          | 40        |
| `CAF-CAPU`    | Capuchino (caliente)                          | `cafe`       | 4.500  | 1.600          | 40        |
| `CAF-LATT`    | Latte (caliente)                              | `cafe`       | 5.000  | 1.900          | 30        |
| `CAF-COLD`    | Cold brew (frío)                              | `cafe`       | 5.500  | 1.800          | 30        |
| `CAF-LFRI`    | Latte frío                                    | `cafe`       | 5.500  | 2.000          | 30        |
| `CAF-FRAP`    | Frappé de café (frío)                         | `cafe`       | 7.000  | 2.600          | 25        |
| `BEB-JNAR`    | Jugo natural de naranja                       | `bebida`     | 5.000  | 1.800          | 25        |
| `BEB-JMOR`    | Jugo natural de mora                          | `bebida`     | 5.000  | 1.900          | 25        |
| `BEB-GASE`    | Gaseosa                                       | `bebida`     | 3.000  | 1.300          | 48        |
| `BEB-AGUA`    | Agua                                          | `bebida`     | 2.000  | 700            | 48        |
| `BEB-TEFR`    | Té frío                                       | `bebida`     | 3.500  | 1.100          | 30        |
| `PAN-ESPO`    | Esponjado de queso                            | `panaderia`  | 3.000  | 1.100          | 30        |
| `PAN-PAND`    | Pandebono                                     | `panaderia`  | 2.500  | 900            | 30        |
| `PAN-ALMO`    | Almojábana                                    | `panaderia`  | 2.500  | 900            | 30        |
| `PAS-CHEE`    | Porción de cheesecake                         | `pasteleria` | 7.500  | 3.000          | 16        |
| `PAS-CUPC`    | Cupcake                                       | `pasteleria` | 5.000  | 1.900          | 20        |
| `SNK-PAPA`    | Papas fritas                                  | `snack`      | 3.500  | 1.500          | 40        |
| `SNK-GAAV`    | Galletas de avena                             | `snack`      | 3.000  | 1.000          | 40        |
| `SNK-GACH`    | Galletas con chips de chocolate               | `snack`      | 3.500  | 1.200          | 40        |
| `SNK-MIXF`    | Mix de frutos secos                           | `snack`      | 4.000  | 1.700          | 30        |
| `CMB-CLASICO` | Combo Clásico = Capuchino + Pandebono         | `combo`      | 6.500  | 2.500 (38,5 %) | calculado |
| `CMB-ESTUDIO` | Combo Estudio = Cold brew + Galletas de avena | `combo`      | 7.500  | 2.800 (37,3 %) | calculado |
| `CMB-DULCE`   | Combo Dulce = Latte + Cupcake                 | `combo`      | 10.000 | 3.800 (38,0 %) | calculado |

## Decisiones confirmadas por el usuario

1. `GET /products` y `GET /products/:id` solo para `admin` y `operador`; el cliente usa `GET /menu` (RN-36).
2. El menú es público, sin sesión (RN-37).
3. Categorías: bebida, café, snack, panadería, pastelería y combo (RN-28). El valor de la API es `snack` en singular.
4. Menú nuevo con los productos de la tabla anterior; el inventario de ejemplo del taller se elimina (RN-39).

## Criterios de aceptación

| ID    | Escenario                                                                                                                                                 | Resultado                                                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-01 | Aplicar la migración sobre una base con productos del taller                                                                                              | Los productos existentes conservan sus datos y quedan con `category=snack`, `price=0`, `cost=0`, `sold_out=false`; existe `product_components`            |
| CA-02 | `down()` con y sin combos                                                                                                                                 | Con algún combo aborta sin cambios; sin combos elimina la tabla y las cuatro columnas                                                                     |
| CA-03 | Insertar directamente filas que violan una restricción                                                                                                    | Rechaza categoría desconocida, precio o costo negativos o mayores a 1.000.000, combo con saldo, componente que es el propio combo, cantidad 0 u 11        |
| CA-04 | Admin crea un producto simple con categoría, precio y costo                                                                                               | `201`; nace activo, `soldOut=false`, `stock=0`, `available=false` (sin saldo); `costPercent` correcto; `components=[]`                                    |
| CA-05 | Crear sin `category` o `price`, con categoría desconocida, precio 0, negativo, decimal, texto o > 1.000.000, costo inválido, o `components` en un simple  | `400`; no se crea nada                                                                                                                                    |
| CA-06 | Admin crea un combo válido                                                                                                                                | `201` con `components` completos (producto, SKU, nombre, cantidad); `cost` = suma de costos × cantidad; `costPercent`; `stock` calculado                  |
| CA-07 | Combo con menos de 2 o más de 10 componentes, repetidos, cantidad fuera de 1–10, componente inexistente, inactivo o que es un combo, o con `cost` enviado | `400` con el motivo; no se crea el combo ni quedan filas de composición                                                                                   |
| CA-08 | `costPercent` y `cost` calculados                                                                                                                         | Redondeo a un decimal (p. ej. 2.600 / 7.000 = 37,1); `null` si `price = 0`; el costo de un combo sigue a sus componentes                                  |
| CA-09 | Un componente cambia de saldo por movimientos `IN` y `OUT`                                                                                                | El `stock` y el `available` del combo reflejan `min(⌊saldo ÷ cantidad⌋)` en la siguiente lectura                                                          |
| CA-10 | `POST /movements` sobre un combo; sobre uno de sus componentes                                                                                            | `409` con el mensaje de RN-31 y sin cambios; el del componente funciona como siempre                                                                      |
| CA-11 | Operador y admin cambian `soldOut`; repartidor y cliente lo intentan; sin sesión                                                                          | `200` con el producto y su `available`; `403` para repartidor y cliente; `401` sin sesión; repetir el valor es idempotente                                |
| CA-12 | Marcar `soldOut` a un componente                                                                                                                          | Sus combos pasan a `available=false` y vuelven a `true` al desmarcarlo                                                                                    |
| CA-13 | `PUT /products/:id/components` con una composición válida                                                                                                 | `200`; reemplaza la anterior por completo y recalcula `cost`, `stock` y `available`                                                                       |
| CA-14 | `PUT` inválido (RN-30), sobre un producto simple, o sobre un id inexistente                                                                               | `400` y la composición anterior intacta / `409 "El producto no es un combo."` / `404`                                                                     |
| CA-15 | `PATCH /products/:id` con precio, costo, categoría o nombre                                                                                               | `200`; `costPercent` se recalcula; repetir valores no cambia `updatedAt`; objeto vacío → `400`                                                            |
| CA-16 | `PATCH` con `cost` sobre un combo, o categoría hacia o desde `combo`                                                                                      | `400`; nada cambia                                                                                                                                        |
| CA-17 | Eliminar un producto que es componente / eliminar un combo                                                                                                | `409 "El producto es componente de un combo."` / `204` y su composición desaparece (los componentes siguen existiendo)                                    |
| CA-18 | Desactivar un componente y reactivarlo                                                                                                                    | Sus combos quedan `available=false` (siguen listados) y se recuperan al reactivar                                                                         |
| CA-19 | `GET /products` y `GET /products/:id` con admin y con operador                                                                                            | `200` con todos los campos nuevos; combos con `components`                                                                                                |
| CA-20 | `GET /products` y `GET /products/:id` con repartidor, cliente y sin sesión                                                                                | `403`, `403` y `401`                                                                                                                                      |
| CA-21 | `GET /products?category=…`: cada categoría y un valor inválido                                                                                            | Filtra correctamente (y se combina con `search` y `active`) / `400`                                                                                       |
| CA-22 | `GET /menu` sin sesión                                                                                                                                    | `200`; solo productos activos, ordenados por categoría y nombre; combos con nombres y cantidades; `Cache-Control: no-store`                               |
| CA-23 | Claves de `GET /menu`                                                                                                                                     | Exactamente `id, sku, name, description, category, price, available, components`; nunca `cost`, `costPercent`, `stock`, `active` ni `soldOut`             |
| CA-24 | `GET /menu` tras cambiar `soldOut` o el saldo                                                                                                             | La siguiente petición ya refleja el cambio                                                                                                                |
| CA-25 | Dos peticiones simultáneas: crear un combo con un componente y eliminar ese componente                                                                    | Nunca queda un combo huérfano ni un `500`: gana una de las dos y la otra recibe `400` o `409`                                                             |
| CA-26 | `npm run seed` dos veces sobre una base limpia                                                                                                            | Crea 20 productos simples (con saldo por movimientos `IN`) y 3 combos con la composición de la tabla; no crea ningún `INV-*`; la segunda vez no crea nada |
| CA-27 | Los `costPercent` del seed                                                                                                                                | Los tres combos quedan por debajo del 39 % y los `costPercent` coinciden con la tabla                                                                     |
| CA-28 | Swagger JSON                                                                                                                                              | Exactamente 26 operaciones; `GET /menu` sin seguridad; `PATCH sold-out` documenta `403`; el enum de categorías y los campos nuevos aparecen               |
| CA-29 | Cobertura global                                                                                                                                          | ≥ 80 % en líneas, sentencias, funciones y ramas                                                                                                           |

## Trazabilidad (prevista)

| Criterio            | Prueba                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| CA-01 a CA-03       | `test/database/catalog-migration.e2e-spec.ts`                                  |
| CA-04 a CA-08       | `test/database/catalog.e2e-spec.ts` y `test/unit/catalog-calculations.spec.ts` |
| CA-09, CA-10        | `test/database/combos.e2e-spec.ts`                                             |
| CA-11, CA-12        | `test/database/sold-out.e2e-spec.ts`                                           |
| CA-13, CA-14        | `test/database/combos.e2e-spec.ts`                                             |
| CA-15, CA-16        | `test/database/catalog.e2e-spec.ts`                                            |
| CA-17, CA-18, CA-25 | `test/database/combos.e2e-spec.ts` (y las suites existentes de eliminación)    |
| CA-19 a CA-21       | `test/database/catalog.e2e-spec.ts` y `test/database/roles.e2e-spec.ts`        |
| CA-22 a CA-24       | `test/database/menu.e2e-spec.ts`                                               |
| CA-26, CA-27        | `test/database/seed.e2e-spec.ts`                                               |
| CA-28               | `test/swagger.e2e-spec.ts`                                                     |
| CA-29               | `npm run test:cov`                                                             |
