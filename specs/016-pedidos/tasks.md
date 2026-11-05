# Tareas 016 — seguimiento

Fecha: 2026-11-05. Una tarea se marca solo con evidencia verificable; los resultados se registran en `docs/commits/016.md`.

- [x] C16-00: contrastar el código existente (movimientos, productos, clientes, puntos) y redactar la spec.
- [x] C16-01: spec aprobada por el usuario.
- [x] C16-02: plan, tareas y decisiones D-92 a D-98 en `docs/decisions.md`.
- [x] C16-03: migración `1791244807000-orders`, entidades y registro en `data-source.ts`; pruebas (CA-01, CA-02).
- [x] C16-04: funciones puras de pedidos (expansión de combos, total, huella, tarjetas de prueba); pruebas unitarias.
- [x] C16-05: extraer `applyMovement` en `MovementsService` sin cambiar el contrato HTTP; `orderId` en la vista de movimientos; pruebas (CA-26).
- [x] C16-06: `POST /orders` con validaciones, pago de demostración y descuento de saldo; pruebas (CA-03 a CA-14).
- [x] C16-07: idempotencia; pruebas (CA-15 a CA-18).
- [x] C16-08: consultas de pedidos por rol; pruebas (CA-20, CA-21).
- [x] C16-09: cancelación con devolución de saldo; pruebas (CA-22 a CA-25).
- [x] C16-10: concurrencia de compra y de cancelación; pruebas (CA-19, CA-25).
- [x] C16-11: cabeceras, límite de peticiones y Swagger (38 operaciones; CA-27, CA-28).
- [x] C16-12: colecciones Postman (carpeta 07f).
- [x] C16-13: `format:check`, `lint`, `typecheck`, `build` y `test:cov` con resultados reales (CA-29).
- [ ] C16-14: README, trazabilidad en la spec 001 si aplica y `docs/commits/016.md`.
- [ ] C16-15: commit, push y pull request (solo cuando el usuario lo pida).
