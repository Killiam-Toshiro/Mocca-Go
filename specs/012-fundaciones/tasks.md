# Tareas 012 — seguimiento

Fecha: 2026-11-04. Una tarea se marca solo con evidencia verificable; los resultados se registran en `docs/commits/012.md`.

- [x] C12-00: contrastar el código actual (roles, JWT, configuración, seed) y redactar spec y plan.
- [x] C12-01: spec y plan aprobados por el usuario el 2026-11-05 (incluida la base `mocca_go`).
- [x] C12-02: registrar D-66 a D-72 en `docs/decisions.md`.
- [x] C12-03: migración `1791244803000-mocca-roles` y entidad `User` con los cuatro roles y `STAFF_ROLES`.
- [x] C12-04: DTOs y `changeRole` con `STAFF_ROLES` y el `409` para clientes; Swagger de roles.
- [x] C12-05: pruebas de migración, roles y matriz de permisos (CA-01 a CA-11).
- [x] C12-06: `CORS_ORIGINS` (validación, `enableCors`, `.env.example`) y pruebas (CA-12 a CA-14).
- [x] C12-07: `ACCESS_TOKEN_TTL_SECONDS` en configuración, módulo y servicio de autenticación, y descripción de Swagger; pruebas (CA-15, CA-16).
- [x] C12-08: issuer/audience, título de Swagger, `package.json` y README; prueba de JWT antiguo (CA-17, CA-20).
- [x] C12-09b: base `mocca_go` en código, `.env.example`, README y prueba unitaria (CA-22); documentar cómo recrear el volumen local.
- [x] C12-09: seed con `repartidor` y `SEED_COURIER_PASSWORD`; pruebas (CA-18, CA-19).
- [x] C12-10: colecciones Postman (local y de despliegue): claims `mocca-go-*` y carpeta «07b» con el repartidor y el rol `cliente`. La local corrió con newman contra la API nueva: 235 peticiones y 610 aserciones, 0 fallos (carpetas 00 a 07b y 09).
- [x] C12-11: `format:check`, `lint`, `typecheck`, `build` y `test:cov` con resultados reales (CA-21).
- [x] C12-12: actualizar spec 001 (RN-07 → RN-12 a RN-15), README, decisiones y escribir `docs/commits/012.md`.
- [ ] C12-13: commit con la identidad real de Git, push de `feature-fundaciones` y pull request para revisión.
