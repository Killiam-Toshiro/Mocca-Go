# Plan 007 — autenticación solo con JWT

1. Confirmar con el grupo las decisiones D-A a D-D y contrastar la redacción de R-02 con el enunciado oficial. Registrar D-37 en adelante en `docs/decisions.md`. Antes de empezar, cerrar y publicar el commit 6 para que este cambio salga en su propio commit.
2. Actualizar primero la documentación normativa: HU-02 y R-02 en la especificación 001, y notas de «reemplazada por 007» en las especificaciones 004 y 005 (sin reescribir su historia).
3. Migración nueva `1791244802000-remove-two-factor`: elimina columnas TOTP, sus restricciones y `auth_proofs`; `down()` restaura la estructura. Quitar las propiedades TOTP de `User`, eliminar `AuthProof` y sacarlo de `data-source.ts`.
4. `AuthService.login` crea la sesión y firma el JWT en la misma transacción bajo bloqueo de usuario; se eliminan `setup`, `confirm`, `verify`, `withProof`, `failedProof` y la lectura de `TOTP_ENCRYPTION_KEY`. `AuthController` conserva `login`, `me` y `logout`; se eliminan los DTOs de 2FA.
5. `UsersService`: `create` devuelve el usuario seguro sin emitir enrolamiento; `changeRole` conserva solo la regla del último admin registrado. Ajustar el controlador y `user.view`.
6. Eliminar `enrollment.ts`, `enroll.ts`, las funciones TOTP y de cifrado de `crypto.ts` (se conserva scrypt), el script `auth:enroll`, y desinstalar `otpauth` actualizando el lockfile. Quitar `TOTP_ENCRYPTION_KEY` de la validación, `.env.example` y `test/setup-env.ts`. Comprobar que un `.env` antiguo no falla.
7. Reescribir las pruebas: auth (login directo, errores uniformes, bloqueo, JWT, sesiones, rutas retiradas → 404, límite por IP), users (sin enrolamiento, nuevo usuario inicia sesión, último admin sin regla TOTP, concurrencia), products (sustituir la prueba de credencial de enrolamiento por un token forjado), migración (con datos del esquema anterior, subida y bajada) y unidades de configuración y crypto.
8. Ejecutar formato, lint, tipos, build y cobertura global con `postgres-test`; probar el proceso compilado (migrar una BD existente, login directo, rutas retiradas) y buscar referencias residuales a TOTP/enrolamiento con `grep`.
9. Actualizar README (recorrido manual más corto), decisiones, trazabilidad, tareas y crear `docs/commits/007.md` con resultados reales.
10. Commit con identidad real y push o pull request; verificar CI y presentar el overview antes del siguiente incremento (movimientos, que pasa a ser el 008).

Riesgo principal: la migración elimina datos de forma definitiva (secretos TOTP). Antes de aplicarla en una BD que no sea de pruebas, el grupo debe estar de acuerdo con D-D. Riesgo secundario: las pruebas de auth y users concentran casi todo el código afectado, por lo que se reescriben antes de dar el incremento por terminado.
