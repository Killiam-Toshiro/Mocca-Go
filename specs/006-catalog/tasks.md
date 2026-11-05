# Tareas 006 — catálogo

- [x] P-T01: spec/plan/tareas aprobados al avanzar; los SKU del seed cumplen `^[A-Z0-9][A-Z0-9._-]{0,47}$`.
- [x] P-T02: decisiones del incremento registradas en `docs/decisions.md`.
- [x] P-T03: módulo, controlador, DTOs y servicio de productos implementados con guards.
- [x] P-T04: listado con filtros, paginación y orden; SKU duplicado → 409; actualizaciones sin tocar el saldo.
- [x] P-T05: pruebas unitarias y HTTP/PostgreSQL real, incluida concurrencia de SKU y saldo intacto.
- [x] P-T06: format, lint, tipos, build y 341 pruebas en 15 suites pasan tras corregir imports; cobertura de 45 archivos >=80% en las cuatro métricas. Smoke compilado verifica health y cinco rutas protegidas. Evidencia en `docs/commits/006.md`.
- [x] P-T07: README, decisiones, tareas, trazabilidad, guía manual y overview actualizados con mediciones locales reproducibles.
- [x] P-T08: commits `8699a2b` y `1d15709` publicados por su autor en `feature-products`; usuario autoriza corrección y push el 2026-10-08.
- [x] P-T09: corrección `815c649` publicada; CI success en run 37845481553.
- [x] P-T10: overview presentado; usuario confirma recorrido manual completo y autoriza movimientos.

Corrección: imports, formato y plantilla `.env.example`; contratos de catálogo sin cambios. La revisión inicial encontró CI fallido en formato y TypeScript/Jest bloqueados antes de ejecutar los casos. Los resultados anteriores se sustituyen por mediciones de la corrección. Commit/push y CI posteriores se informan en el cierre y se incorporan documentalmente en el siguiente incremento.
