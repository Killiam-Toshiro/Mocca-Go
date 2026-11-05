# Plan 002 — bootstrap

1. Usar Node 24, npm 11, CommonJS y TypeScript estricto. Consultar metadata npm para escoger versiones compatibles; registrar versiones exactas en `package.json` y `package-lock.json`.
2. Crear configuración Nest CLI, TypeScript, ESLint y Prettier, y scripts separados de verificación y corrección manual.
3. Implementar `validateEnvironment`, `AppModule`, módulo health y configuración común del prefijo/pipe/hooks. Compartir esa configuración entre arranque y pruebas HTTP para evitar divergencias.
4. Mantener el punto de entrada separado de la creación de la aplicación para que las pruebas HTTP no abran el puerto de desarrollo.
5. Probar configuración con Jest, módulo real con Supertest y pipe global con un controlador exclusivo de pruebas. Cerrar todas las aplicaciones abiertas en teardown.
6. Configurar proyectos Jest para ejecutar unidades, HTTP o ambas juntas con cobertura conjunta. Los tests no cuentan como código fuente; no se excluyen otros archivos de `src`.

   NestJS 12 distribuye módulos ESM. Los scripts de Jest habilitan `--experimental-vm-modules` para que Node 24.15+ permita al runner cargar esas dependencias desde el código CommonJS, sin transformar ni reemplazar Nest en los tests.

7. Crear GitHub Actions para push/pull request: Node 24, `npm ci`, formato, lint, build y `npm run test:cov`; conservar reporte como artefacto.
8. Ejecutar instalación reproducible y checks; comprobar arranque del build y fallo por configuración inválida. Actualizar tareas, decisiones, README y overview con resultados reales antes de crear el commit.

## Referencias consultadas

- [NestJS: primeros pasos](https://docs.nestjs.com/first-steps).
- [NestJS: configuración y validación personalizada](https://docs.nestjs.com/techniques/configuration).
- [NestJS: ValidationPipe](https://docs.nestjs.com/techniques/validation).
- [Jest: coverageThreshold](https://jestjs.io/docs/configuration#coveragethreshold-object).
- [Jest: carga de dependencias ESM](https://jestjs.io/docs/ecmascript-modules#require-of-esm).
- [GitHub Actions: checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node) y [upload-artifact](https://github.com/actions/upload-artifact): se usan las versiones v7 de sus ejemplos oficiales actuales.

La conexión TypeORM y sus versiones se resuelven en el commit 3; no se instala un ORM sin usarlo en este incremento.
