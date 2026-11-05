# Plan 005 — administración de usuarios

1. Registrar autorización del usuario y cierre publicado/CI del commit 4. Especificar DTOs, respuestas seguras, paginación y política de último admin antes del código.
2. Extraer el emisor de enrolamiento para reutilizar su EntityManager dentro de otra transacción, conservando el script y pruebas de 004.
3. Añadir UsersModule con imports de AuthModule, controlador, DTOs y servicio. No se requieren dependencias nuevas ni migración: usuarios/roles/pruebas/sesiones ya existen.
4. Servicio serializa escrituras mediante bloqueo asesor y revalida actor/sesión dentro de la transacción. Bloqueo compartido para listado. Cambio de rol bloquea después usuario destino y cuenta admins registrados/enrolados.
5. Proyectar explícitamente respuestas seguras; convertir solo violación de username único en 409. Mantener secretos fuera de errores/logs esperados y no-store en administración.
6. Probar unidades de DTOs/proyección y flujos reales de creación, enrolamiento, permisos, paginación, cambio de rol, carrera con guard, concurrencia y rollback en esquemas PostgreSQL exclusivos. No simular el ORM.
7. Ejecutar formato, lint, tipos, build y cobertura global; comprobar proceso compilado y conservación de inventario local. Completar README, decisiones, tareas, rúbrica y overview con evidencia.
8. Crear commit `feat: add admin user management and role authorization`; push normal a origin/main, verificar hash y resultado CI; presentar overview antes del siguiente incremento.

Estimar 50% de la rúbrica solo con bloques completos sobre el código vigente: seed 5 + autenticación 5 + autorización 5 + pruebas 25 + persistencia 10. Funcionalidades/Postman, informe y despliegue siguen pendientes. El porcentaje no garantiza la nota del docente y se debe mantener cobertura al ampliar funcionalidades.

Ajuste de verificación: OneDrive vuelve a anunciar archivos regulares como enlaces en la enumeración. Habilitar seguimiento de enlaces en Haste de ambos proyectos Jest y desactivar Watchman por CLI en los scripts, para que la validación de cada proyecto reciba ese parámetro global sin introducir opciones no soportadas. Así se conservan todas las suites/fuentes en cada ejecución. Los nuevos tests mantienen un listener efímero hasta cerrar cada aplicación; las carreras que esperan múltiples peticiones verifican el número de esperas en pg_locks.
