# Plan 007 — movimientos

1. Cerrar 006 con evidencia de `815c649`, CI 37845481553 y confirmación manual del usuario. Crear rama `codex/feature-movements` desde ese catálogo; documentar dependencia respecto de main.
2. Contratos M-01 a M-09 antes del código. Registrar decisión de cantidad/saldo integer, overflow explícito, responsable desde sesión y ausencia de idempotencia en POST.
3. Añadir `MovementsModule`, controller, DTOs, service y view; registrar módulo y no-store. Reutilizar entidad `StockMovement`, `Product`, `Session`, guards y PaginationQueryDto. Sin migración ni dependencias nuevas.
4. Creación con transacción, bloqueo de producto, revalidación de sesión, validación de activo/saldo, update exclusivo de stock e insert auditado. Proyección explícita. Historial con relaciones seguras y conteo/página bajo REPEATABLE READ.
5. Unidades de DTO/proyección y Supertest/PostgreSQL para flujos válidos, errores, historial, rollback real con trigger, concurrencia y espera observable mediante pg_stat_activity. Esquemas exclusivos, sin tocar desarrollo ni simular el ORM.
6. Ejecutar formato, lint, tipos, build y cobertura; smoke del proceso compilado en esquema de pruebas descartable. Registrar resultados medidos y límites.
7. Actualizar README/SDD y guía `docs/movements-manual.md`; overview `docs/commits/007.md`. Registrar un commit del incremento y push de la rama; comprobar CI y presentar overview. La integración en main queda para revisión del grupo.
