# Plan 014 — Catálogo ampliado y combos

Fecha: 2026-11-05. Una migración, una entidad nueva (`ProductComponent`), un controlador público de menú y cambios en productos, movimientos y seed. Sin variables de entorno ni dependencias nuevas.

## Decisiones (registradas en `docs/decisions.md`)

- D-80: el menú vendible vive en `products`, ampliada con `category`, `price`, `cost` y `sold_out`; los combos son productos de categoría `combo` con filas en `product_components`. Un combo no tiene saldo propio (`CHECK category <> 'combo' OR stock = 0`); su saldo, costo y disponibilidad se calculan al leer.
- D-81: `available` y `costPercent` son calculados, nunca almacenados; `soldOut` es el interruptor manual de la cocina y es independiente de `active` (retirado del menú) y del saldo.
- D-82: seis categorías fijas (`cafe`, `bebida`, `panaderia`, `pasteleria`, `snack`, `combo`) en un CHECK; un producto no cambia entre simple y combo.
- D-83: `GET /products` pasa a ser solo `admin` y `operador` (datos internos: saldo y costo); el cliente lee `GET /menu`, público y `no-store`. Modifica el RN-15 de 012.
- D-84: el menú de ejemplo del taller (teclado, mouse, monitor) se reemplaza por el menú de Mocca Go. Como el historial de movimientos es inmutable, la base de desarrollo se recrea en vez de borrar filas.
- D-85: las reglas entre filas (solo los combos tienen componentes, sin combos anidados, componentes activos) las verifica el servicio en una transacción con bloqueo de fila del combo; la FK `RESTRICT` del componente protege contra eliminaciones concurrentes.

## Migración `1791244805000-catalog-and-combos`

- `up()`: agrega a `products` `category varchar(16) NOT NULL DEFAULT 'snack'`, `price integer NOT NULL DEFAULT 0`, `cost integer NOT NULL DEFAULT 0` y `sold_out boolean NOT NULL DEFAULT false`, con CHECK de categoría (`products_category_valid`), de rangos (`products_price_range`, `products_cost_range`) y del saldo de combos (`products_combo_no_stock`). Crea `product_components` con sus FK, CHECK de cantidad (1 a 10) y de autorreferencia, y un índice en `component_id`.
- `down()`: aborta sin cambios si existe algún combo; si no, elimina la tabla y las columnas.

## Código

- `src/products/entities/products.entity.ts`: columnas nuevas y tipo `ProductCategory`; `src/products/entities/product-component.entity.ts`.
- `src/products/catalog.ts`: funciones puras (`costPercent`, `comboCost`, `comboStock`, `isAvailable`, orden de categorías) con pruebas unitarias.
- `src/products/products.view.ts`: `ProductView` ampliado y `MenuItemView`; el servicio carga los componentes de una página con una sola consulta.
- DTOs: creación con `category`, `price`, `cost?`, `components?`; edición con los campos nuevos; `SetSoldOutDto`, `ReplaceComponentsDto`; filtro `category` en el listado.
- Servicio: creación y reemplazo de composición en transacción; validaciones de RN-30; `setSoldOut`; `menu()`; eliminación con `409` si es componente.
- Controladores: lectura de `/products` con `@Roles('admin','operador')`; `PATCH :id/sold-out` (admin y operador); `PUT :id/components` (admin); `MenuController` público.
- `movements.service.ts`: `409` si el producto es un combo (después del `404`).
- `configure-app.ts`: `no-store` en `/products` y `/menu`.
- Seed: menú nuevo con movimientos `IN` (`seedKey` `mocca-menu-v1:<SKU>`); sin `INV-*`.

## Pruebas existentes que cambian

- Las suites de productos, movimientos y eliminación que crean productos por HTTP envían ahora categoría, precio y costo.
- `repartidor` y `cliente` ya no leen `/products` (`403`): se ajustan `roles.e2e-spec`, `customers.e2e-spec` y la lista de permisos de `swagger.e2e-spec`.
- Seed: se reemplazan los conteos y SKUs del inventario de ejemplo.
- Postman: los cuerpos de creación, las carpetas 07b y 07c y una carpeta nueva 07d (menú, combos y «agotado»).

## Riesgos

- Un `GET /menu` público sin límite de peticiones: es una consulta de lectura acotada (máx. 200 productos); si hiciera falta se protege con el limitador existente.
- Cambiar el rol de lectura de `/products` rompe a quien lo consumía como cliente; se documenta en el README y en la spec.
