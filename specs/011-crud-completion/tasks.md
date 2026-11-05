# Tareas 011 — seguimiento

Fecha: 2026-10-12. Una tarea se marca solo con evidencia verificable; los resultados están en `docs/commits/011.md`.

- [x] C11-00: contrastar spec/plan con el código real y corregir referencias (archivos, helpers, FK de sesiones, throttler, número 011); orden de reglas del DELETE de usuarios y carrera con movimientos aprobados por el usuario el 2026-10-12.
- [ ] C11-01: revisar spec/plan con el grupo y asignar responsables (productos, usuarios, health).
- [x] C11-02: D-59 a D-64 registradas en `docs/decisions.md`.
- [x] C11-03: `DELETE /products/:id` con bloqueo de fila, 404/409/204 y Swagger.
- [x] C11-04: pruebas e2e de productos (CA-01 a CA-05) en `test/database/products-delete.e2e-spec.ts`.
- [x] C11-05: `UpdateUserDto`, constante `USER_NOT_FOUND`, helpers `isLastAdmin` e `isDuplicateUsername`; pruebas unitarias del DTO.
- [x] C11-06: `GET /users/:id` con mensaje `"Usuario no encontrado."`.
- [x] C11-07: `PATCH /users/:id` con duplicado, rehash, revocación de sesiones y reinicio de bloqueo.
- [x] C11-08: `DELETE /users/:id` con último admin, auto-eliminación (en ese orden) e historial; sesiones por CASCADE.
- [x] C11-09: `MovementsService` traduce `stock_movements_user_id_fkey` a `401` (CA-18).
- [x] C11-10: pruebas e2e de usuarios (CA-06 a CA-14 y CA-18), incluida concurrencia, en `test/database/users-crud.e2e-spec.ts`.
- [x] C11-11: `GET /health/ready` con timeout, 503 genérico y `no-store` en el middleware; pruebas (CA-15).
- [x] C11-12: Swagger: `503` en `ErrorStatus`, cinco rutas documentadas y `test/swagger.e2e-spec.ts` con exactamente 19 operaciones (CA-16).
- [x] C11-13: colección Postman — carpeta 07 con usuario `qa_del_*` en vez de `qaUserId`, sin `[PENDIENTE]`, y URL de Swagger corregida. La carpeta `postman/` queda lista para versionar; entra al repositorio con el commit (C11-16).
- [x] C11-14: `format:check`, `lint`, `typecheck` y `build` pasan; `test:cov` con 554 pruebas en 22 suites y cobertura de 98,69% / 95,52% / 99,26% / 99,05% (CA-17); colección completa con Postman CLI: 619 aserciones sin fallos.
- [x] C11-15: spec 001 (contratos, RN-08 a RN-11 y R-06), tasks 001, notas de reemplazo en 006/007/009, README y `docs/commits/011.md`.
- [x] C11-16: código publicado en main `635e928`, CI/deploy success run 38324403873 comprobados el 2026-10-13; revisión del grupo se mantiene en C11-01.
