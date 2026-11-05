# Tareas 007 — autenticación solo con JWT

- [x] J-T01: decisiones D-A a D-D aprobadas por el grupo; el usuario ratifica JWT-only y excluye 2FA del alcance vigente el 2026-10-13 (D-65).
- [x] J-T02: decisiones D-37 en adelante registradas; 001, 004 y 005 actualizadas o marcadas como reemplazadas.
- [x] J-T03: migración nueva y entidades sin estructura TOTP; verificada sobre una BD con datos del esquema anterior.
- [x] J-T04: login directo con sesión y JWT; rutas 2FA retiradas (404); sin cifrado ni `otpauth`.
- [x] J-T05: creación de usuarios sin enrolamiento y regla de último admin simplificada.
- [x] J-T06: script `auth:enroll`, `TOTP_ENCRYPTION_KEY`, DTOs y código muerto eliminados; `.env` antiguo no falla.
- [x] J-T07: pruebas de auth, users, products, migración y configuración reescritas y en verde.
- [x] J-T08: formato, lint, tipos, build y cobertura >=80% en las cuatro métricas; proceso compilado y búsqueda de referencias residuales.
- [x] J-T09: README, decisiones, trazabilidad, tareas y `docs/commits/007.md` actualizados.
- [x] J-T10: `cc5eee2` publicado en `fix/fix-auth` e integrado en main mediante `725d69a` y `2a86b32`.
- [x] J-T11: overview presentado y revisado por el grupo antes de integrar.
