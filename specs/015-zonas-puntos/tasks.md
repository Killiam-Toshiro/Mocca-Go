# Tareas 015 — seguimiento

Fecha: 2026-11-05. Una tarea se marca solo con evidencia verificable; los resultados se registran en `docs/commits/015.md`.

- [x] C15-00: contrastar el código existente (seed, productos, menú) y redactar la spec.
- [x] C15-01: spec aprobada por el usuario el 2026-11-05 (puntos fijos, cuatro zonas, 17 puntos con sus pisos e indicaciones, solo admin).
- [x] C15-02: plan, tareas y decisiones D-86 a D-91 en `docs/decisions.md`.
- [x] C15-03: migración `1791244806000-delivery-zones-points`, entidades y registro en `data-source.ts`; pruebas (CA-01, CA-02).
- [x] C15-04: zonas: crear, editar, eliminar y listar para administración; pruebas (CA-03 a CA-05, CA-13).
- [x] C15-05: puntos: crear, editar, mover, activar, desactivar y eliminar; pruebas (CA-06 a CA-08).
- [x] C15-06: permisos y orden de validación (`401 → 403 → 400 → 404 → 409`); pruebas (CA-09).
- [x] C15-07: consulta pública, `no-store` y límite de peticiones; pruebas (CA-10 a CA-12, CA-14).
- [x] C15-08: concurrencia entre crear un punto y eliminar su zona; pruebas (CA-15).
- [x] C15-09: seed de 4 zonas y 17 puntos; pruebas (CA-16).
- [x] C15-10: ajustar las suites existentes y Swagger (34 operaciones; CA-17).
- [x] C15-11: colecciones Postman (carpeta 07e).
- [x] C15-12: `format:check`, `lint`, `typecheck`, `build` y `test:cov` con resultados reales (CA-18).
- [x] C15-13: README, spec 001 si aplica y `docs/commits/015.md`.
- [ ] C15-14: commit, push y pull request (solo cuando el usuario lo pida).
