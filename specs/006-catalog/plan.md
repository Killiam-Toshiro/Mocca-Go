# Plan 006 — catálogo de productos

1. La entidad `Product` ya impone SKU `^[A-Z0-9][A-Z0-9._-]{0,47}$` (`varchar(48)`), nombre no vacío (`varchar(120)`) y `stock >= 0`, por lo que no hace falta migración. Los SKU del seed (`INV-001` a `INV-003`) cumplen el formato. Registradas en `docs/decisions.md` (D-31 a D-36): SKU inmutable, sin normalización automática y límite de 500 caracteres para la descripción.
2. Añadir `ProductsModule` con imports de `AuthModule`, controlador, DTOs y servicio, reutilizando `AuthGuard`, `Roles` y `RolesGuard`. En principio sin dependencias nuevas ni migración.
3. DTOs con validación estricta (lista blanca, campos extra → 400). Extraer o reutilizar el parseo de paginación de `users` para no duplicar reglas.
4. Servicio: proyección explícita de la respuesta; creación que convierte únicamente la violación de la restricción única del SKU en 409; actualizaciones que escriben solo columnas de catálogo; listado con filtros, escape de comodines, conteo y orden estable.
5. Pruebas: unidades de DTOs, paginación y proyección; Supertest sobre PostgreSQL real en esquemas exclusivos para permisos, CRUD, validaciones, filtros, idempotencia, SKU duplicado concurrente y saldo intacto. No simular el ORM.
6. Ejecutar `format:check`, `lint`, `typecheck`, `build` y `test:cov` con `postgres-test` iniciado; comprobar el proceso compilado. Registrar resultados reales.
7. Actualizar README, decisiones, tareas, trazabilidad (R-06 parcial) y crear `docs/commits/006.md`.
8. Crear commit en rama propia, abrir pull request, verificar CI y presentar overview antes del siguiente incremento (movimientos).

R-06 solo se marca completo cuando existan también los movimientos y la colección Postman. Este incremento implementa el catálogo; no se presenta como cumplimiento total.

## Corrección autorizada el 2026-10-08

La revisión de `1d15709` detectó imports incompatibles con las subcarpetas versionadas, formato inválido, eliminación de `.env.example` y documentación de cierre no reproducible. Corregir las rutas manteniendo la estructura aportada por el grupo, restaurar la plantilla sin secretos y completar README/trazabilidad. No cambiar contratos, dependencias ni migraciones. Ejecutar las verificaciones sobre esta versión con PostgreSQL real; sustituir las cifras anteriores por resultados medidos. Registrar un commit de corrección y hacer push a `feature-products`; comprobar CI antes de guiar el recorrido manual.
