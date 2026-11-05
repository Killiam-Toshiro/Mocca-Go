# Cómo colaborar con Spec-Driven Design

La especificación es el acuerdo de comportamiento del grupo. Usamos Markdown versionado; no se necesita instalar Spec Kit. Cada cambio conserva la cadena **requisito → criterio → tarea → código → prueba → evidencia**.

## Antes de programar

1. Actualiza tu copia con `git pull --ff-only origin main` y lee el [README](../README.md), la [especificación general](../specs/001-inventory/spec.md), las [decisiones](decisions.md) y las [tareas](../specs/001-inventory/tasks.md).
2. Acuerda con el grupo una funcionalidad y su responsable. Trabaja en una rama propia, por ejemplo `git switch -c feat/catalogo`. Evita que dos personas implementen el mismo contrato a la vez.
3. Crea una carpeta `specs/NNN-funcionalidad/` con `spec.md`, `plan.md` y `tasks.md`, siguiendo los incrementos existentes. Coordina el número con el grupo.
4. En `spec.md`, escribe lo que debe ocurrir: actor, permisos, reglas, entradas, salidas, errores y criterios de aceptación observables. En `plan.md`, explica módulos, persistencia/migración y verificaciones. En `tasks.md`, divide el trabajo y deja pendientes las tareas no verificadas.
5. Revisa el contrato con el grupo antes de implementar. Si cambia durante el desarrollo, actualiza primero la especificación y registra el motivo en decisiones.

## Al implementar y cerrar un commit

- Mantén el alcance acordado y reutiliza configuración, transacciones y guards existentes. Las rutas privadas necesitan `AuthGuard`; para permisos usa `Roles` y `RolesGuard` después del guard de autenticación.
- Escribe pruebas de comportamiento: casos válidos, errores, permisos y concurrencia cuando corresponda. PostgreSQL de pruebas es independiente; no elimines datos de desarrollo ni reduzcas el umbral del 80%.
- Ejecuta `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` y `npm run test:cov` con `postgres-test` iniciado. Registra resultados reales; una prueba prevista no cuenta como aprobada.
- Actualiza tareas, trazabilidad de la especificación general, README y decisiones. Crea `docs/commits/NNN.md` con qué cambió, por qué, resultados y límites. Incluye documentación y código en el mismo incremento revisable.
- Haz un commit con tu identidad real de Git y un mensaje que describa el cambio. Publica tu rama y abre un pull request para que otra persona revise el diff, los criterios y CI antes de integrar. No reescribas commits de compañeros ni publiques secretos, `.env`, `dist`, `node_modules` o cobertura generada.
- Presenta el overview y revisen el incremento antes de empezar el siguiente. Conserva tareas pendientes cuando todavía falta evidencia.

## Ejemplo: una salida de inventario

**Especificación:** una salida mayor al saldo devuelve `409`, sin cambiar stock ni historial. Dos salidas simultáneas de 4 con saldo 6 permiten solo una.

**Plan:** servicio de movimientos con transacción y bloqueo de producto; validación de usuario, producto activo y saldo.

**Tareas:** DTO, servicio/ruta, permisos, pruebas de saldo/concurrencia y actualización del overview. Se marcan completadas después de verificar.

**Evidencia:** pruebas Supertest sobre PostgreSQL confirman respuesta, saldo e historial; el overview registra comandos y cobertura.

## Si usas un asistente de código

Puedes indicar: «Lee README, decisiones y la especificación de este incremento. Implementa solo las tareas acordadas. Si hace falta cambiar un contrato, actualiza primero spec/plan/tasks. Ejecuta los checks, registra resultados reales y prepara un overview. Detente después del incremento para revisión».

Revisa lo generado y asegúrate de poder explicar sus reglas y pruebas. El grupo sigue siendo responsable del diseño, la revisión y sus contribuciones.
