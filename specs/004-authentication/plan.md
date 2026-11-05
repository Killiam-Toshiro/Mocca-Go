# Plan 004 — autenticación

1. Fijar @nestjs/jwt 12.0.2, OTPAuth 9.5.2 y @nestjs/throttler 6.7.1, compatibles con NestJS 12.
2. Validar configuración de seguridad, implementar verificación scrypt, cifrado autenticado y TOTP.
3. Añadir campos de usuario, entidades de pruebas/sesiones y migración reversible incremental.
4. Implementar servicio con transacciones y bloqueos de usuario primero, prueba después. Persistir fallos antes de lanzar errores HTTP.
5. Incorporar DTOs, controlador, guard JWT/sesión y guard de roles; script privado de enrolamiento.
6. Probar con bases aisladas el flujo HTTP real, revocación, expiración, replay, límites y concurrencia; conservar verificaciones anteriores.
7. Completar README, tareas, decisiones y overview; ejecutar checks y crear commit `feat: add JWT authentication with TOTP and revocable sessions`.
8. Publicar los cuatro commits en el remoto autorizado y verificar hash remoto. Administración y dominio siguen pendientes.

Las pruebas de ventanas/expiración usan timestamps explícitos en helpers o cambios de filas en esquemas propios; no esperan intervalos reales ni simulan el ORM. El flujo manual sí usa códigos del autenticador. Las claves reales locales se generan en .env ignorado; no se imprimen ni versionan.
