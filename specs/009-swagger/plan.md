# Plan 009 — documentación OpenAPI

1. Registrar spec, plan, tareas y decisiones D-47 a D-50 antes del código.
2. Instalar `@nestjs/swagger` 12.0.2 con versión exacta. Es compatible con NestJS 12, TypeScript 5.9, class-validator y class-transformer; Express ya está instalado y la dependencia opcional de Fastify no aplica. Sin migración.
3. Crear `src/swagger.ts` con `DocumentBuilder` (título, versión, descripción y esquema bearer) y `SwaggerModule.setup('api/v1/docs', …)`. Llamarlo desde `configureApplication` después de fijar el prefijo global, para que el documento y las pruebas usen la misma configuración que la API.
4. Decoradores explícitos, sin plugin del CLI:
   - Controladores: `@ApiTags`, `@ApiBearerAuth` en rutas protegidas, `@ApiOperation` con el rol permitido y respuestas de éxito y error.
   - DTOs de entrada: `@ApiProperty`/`@ApiPropertyOptional` con patrón, longitud, enumeración, rango y valores por defecto, reutilizando las mismas constantes que class-validator cuando existen.
   - Respuestas: clases solo de documentación en `*.responses.ts` de cada módulo y `src/common/openapi.ts` para el error común y un decorador que agrupa respuestas de error. Las proyecciones (`*.view.ts`) no cambian.
5. Prueba `test/swagger.e2e-spec.ts` con Supertest: UI y JSON disponibles, lista exacta de operaciones, seguridad, `401`/`403`, campos obligatorios y patrones de DTOs y ausencia de campos sensibles.
6. Ejecutar formato, lint, tipos, build y cobertura completa sobre PostgreSQL real. Registrar resultados medidos.
7. Actualizar README (sección de documentación interactiva), decisiones, tareas, trazabilidad 001 y overview `docs/commits/009.md`. Commit local; push solo con autorización.
