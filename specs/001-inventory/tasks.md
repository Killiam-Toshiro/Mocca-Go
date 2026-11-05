# Tareas 001 — seguimiento

Fecha: auditoría 2026-10-13. Las marcas distinguen comportamiento verificado, requisitos originales y confirmaciones del usuario.

## Commit 1 — documentación

- [x] C1-01: identificar ejemplo y carpeta de trabajo; comprobar que el remoto indicado está vacío y clonarlo en la carpeta elegida.
- [x] C1-02: registrar la elección del usuario: inventario y archivos versionados de Spec-Driven Design.
- [x] C1-03: definir historias, reglas, contratos propuestos y criterios de aceptación.
- [x] C1-04: mapear todos los requisitos y porcentajes de la rúbrica.
- [x] C1-05: preparar alcance y validaciones de los commits 2 y 3.
- [x] C1-06: documentar decisiones, pendientes, flujo por commit y overview.
- [x] C1-07: verificar enlaces locales, rúbrica y whitespace; resultados registrados en el overview.
- [x] C1-08: registrar este incremento como primer commit local con los archivos documentales verificados.
- [x] C1-09: overview presentado; el usuario autorizó avanzar al segundo commit el 2026-10-06.

## Commit 2 — cerrado

- [x] C2-01: el usuario autorizó continuar sin cambios de alcance; documentos actualizados.
- [x] C2-02: bootstrap especificado en `specs/002-bootstrap`; versiones compatibles verificadas y fijadas.
- [x] C2-03: NestJS, configuración, validación y health implementados.
- [x] C2-04: Jest, Supertest, umbral de cobertura y CI inicial configurados.
- [x] C2-05: checks pasan; resultados y limitaciones registrados en `docs/commits/002.md`.
- [x] C2-06: registrar el segundo commit local.
- [x] C2-07: el usuario autorizó avanzar al commit 3 tras el overview, el 2026-10-06.

## Commit 3 — cerrado

- [x] C3-01: usuario autorizó continuar; especificación de persistencia/seed preparada.
- [x] C3-02: esquema, constraints, saldo almacenado y claves de seed definidos en el incremento 003.
- [x] C3-03: PostgreSQL, TypeORM, migración y aislamiento configurados y verificados.
- [x] C3-04: seed crea admin, operador y datos de inventario sin duplicar ni borrar registros existentes.
- [x] C3-05: migración, integridad, rollback, persistencia e idempotencia/concurrencia pasan en PostgreSQL; CI extendido.
- [x] C3-06: README, SDD y overview actualizados con resultados reales.
- [x] C3-07: registrar el tercer commit local.
- [x] C3-08: overview presentado; el usuario autorizó commit 4 y push el 2026-10-06.

## Commit 4 — autenticación

- [x] C4-01: usuario autoriza incremento y publicación; contratos y políticas en `specs/004-authentication` antes del código.
- [x] C4-02: JWT, TOTP cifrado, migración incremental y script de enrolamiento implementados.
- [x] C4-03: sesiones revocables, identidad, límites persistidos y guards reutilizables implementados.
- [x] C4-04: 126 pruebas, cobertura y checks finales verificados; evidencia en `docs/commits/004.md`.
- [x] C4-05: documentación actualizada; registrar este incremento como cuarto commit.
- [x] C4-06: `bf84eaa` publicado y hash remoto verificado; CI success en run 37534758745.
- [x] C4-07: overview/recomendación presentados; usuario autoriza commit 5 el 2026-10-07.

## Commit 5 — administración y autorización

- [x] C5-01: usuario autoriza implementar autorización y push; contratos/políticas en `specs/005-users` antes del código.
- [x] C5-02: crear/listar usuarios y cambiar roles con guards, proyección segura y emisor de enrolamiento transaccional.
- [x] C5-03: protección de último admin registrado/enrolado y revalidación de actor/sesión bajo bloqueo administrativo.
- [x] C5-04: 184 pruebas en 13 suites, PostgreSQL real y cobertura >=80% en las cuatro métricas; smoke compilado correcto.
- [x] C5-05: documentación, trazabilidad, README y overview actualizados; registrar este incremento como quinto commit.
- [x] C5-06: `5fd8c43` publicado en main; CI success en run 37665422856.
- [x] C5-07: overview y avance presentados; usuario solicita revisar y corregir catálogo el 2026-10-08.

## Incremento 006 — catálogo del grupo y corrección

- [x] C6-01: especificación del catálogo publicada en `8699a2b`, implementación/pruebas en `1d15709` de `feature-products`.
- [x] C6-02: revisión identifica imports inválidos, fallo de formato/CI y discrepancias documentales; usuario autoriza corrección y push.
- [x] C6-03: corregir imports conservando subcarpetas y contratos, restaurar `.env.example` y completar recorrido manual.
- [x] C6-04: 341 pruebas en 15 suites, cobertura >=80%, lint/tipos/build/formato y smoke compilado; resultados medidos en `docs/commits/006.md`.
- [x] C6-05: `815c649` publicado en feature-products; CI success en run 37845481553.
- [x] C6-06: overview/guía presentados; usuario confirma recorrido manual completo y autoriza 007.

## Incremento 008 — movimientos (`specs/008-movements`)

- [x] C7-01: usuario autoriza siguiente commit y push; rama codex/feature-movements desde catálogo verificado, contratos previos en specs/007-movements.
- [x] C7-02: módulo/DTOs/rutas/proyección e implementación transaccional de stock/historial.
- [x] C7-03: 439 pruebas/17 suites y cobertura >=80%; rollback, concurrencia, esperas y regresiones completas.
- [x] C7-04: lint/tipos/build y smoke compilado correctos; README/SDD/guía/overview actualizados y formato verificado al cierre.
- [x] C7-05: `5ebb7dc` publicado en `codex/feature-movements` e integrado en main mediante `725d69a` y `2a86b32`.
- [x] C7-06: overview presentado; el grupo integró movimientos en main el 2026-10-12.

## Commit 6 — catálogo de productos

- [x] C6-01: contratos y políticas en `specs/006-catalog` antes del código; decisiones D-31 a D-36.
- [x] C6-02: cinco rutas de catálogo con guards, proyección explícita y errores sin detalles de SQL.
- [x] C6-03: edición/estado con bloqueo de fila, sin escribir `stock` ni modificar `updatedAt` sin cambios; SKU duplicado concurrente.
- [x] C6-04: 341 pruebas en 15 suites (157 nuevas) con PostgreSQL real y cobertura >=80% en las cuatro métricas; smoke compilado correcto.
- [x] C6-05: README, trazabilidad, decisiones, tareas y overview actualizados.
- [x] C6-06: `1d15709`/`815c649` publicados en `feature-products` e integrados en main mediante `2a86b32`.
- [x] C6-07: overview presentado y revisado por el grupo antes de integrar.

## Commit 7 — retiro del 2FA

- [x] C7-01: contratos y decisiones D-37 a D-40 en `specs/007-jwt-only-auth` antes del código.
- [x] C7-02: login directo con JWT y sesión; rutas 2FA retiradas; migración incremental y entidades sin TOTP.
- [x] C7-03: creación de usuarios sin enrolamiento y último admin simplificado; script, cifrado y `otpauth` eliminados.
- [x] C7-04: 341 pruebas en 15 suites con PostgreSQL real y cobertura >=80% en las cuatro métricas; smoke compilado correcto.
- [x] C7-05: README, trazabilidad, decisiones, tareas y overview actualizados.
- [x] C7-06: `cc5eee2` publicado en `fix/fix-auth` e integrado en main mediante `725d69a` y `2a86b32`.
- [x] C7-07: overview presentado y revisado por el grupo antes de integrar.

## Incremento 009 — documentación OpenAPI

- [x] C9-01: usuario aprueba Swagger con opciones recomendadas; contratos y decisiones D-47 a D-50 en `specs/009-swagger` antes del código.
- [x] C9-02: `@nestjs/swagger` 12.0.2, UI en `/api/v1/docs`, JSON en `/api/v1/docs-json` y 14 operaciones documentadas con roles, parámetros y respuestas.
- [x] C9-03: 450 pruebas/18 suites y cobertura >=80%; lint/tipos/build/formato y smoke compilado correctos; README y overview actualizados.
- [x] C9-04: `db6b8e8` publicado en `feature-swagger` e integrado en main mediante el PR #2 (`21dd53a`).

## Incremento 010 — despliegue en Railway

- [x] C10-01: rama `feat-despliegue` desde `21dd53a`; spec, plan y tareas en `specs/010-deployment` antes del código, con decisiones propuestas D-51 a D-58.
- [x] C10-02: usuario aprueba D-51 a D-58 el 2026-10-12; despliegue solo desde `main`.
- [x] C10-03: integrado por PR #4; main 635e928 con verify/deploy/smoke success run 38324403873 y API pública comprobada el 2026-10-13.
- [x] C10-04: cierre docs/commits/010.md con URL, run y límites de evidencia privada.

## Incremento 011 — CRUD completo y readiness

- [x] C11-01: spec, plan y tareas en `specs/011-crud-completion` contrastados con el código antes de implementar; decisiones D-59 a D-64 aprobadas por el usuario el 2026-10-12.
- [x] C11-02: `DELETE /products/:id`, `GET`/`PATCH`/`DELETE /users/:id` y `GET /health/ready` implementados sin migración ni dependencias nuevas; Swagger con 19 operaciones.
- [x] C11-03: pruebas Jest/Supertest con PostgreSQL real, incluida la concurrencia de CA-05, CA-14 y CA-18; resultados medidos en `docs/commits/011.md`.
- [x] C11-04: colección Postman versionada con la carpeta 07 actualizada; corrida completa sin fallos.
- [x] C11-05: main 635e928 publicada; CI/deploy success verificados. Revisión del grupo se conserva en C11-01 de su spec.

## Entrega completa — seguimiento

- [x] F-01: autenticación JWT, sesiones, logout y rutas protegidas verificados. El usuario excluye 2FA del alcance vigente el 2026-10-13 (D-65).
- [x] F-02: administración/roles y `401`/`403` verificados en 005; aplicar los mismos guards a inventario al crear esas rutas.
- [x] F-03: catálogo y consulta de existencias con validaciones, filtros, paginación y permisos verificados en 006. Cambiar existencias mediante movimientos sigue en F-04.
- [x] F-04: entradas/salidas, atomicidad/concurrencia e historial verificados en 008 y regresiones actuales.
- [x] F-05: auditoría 2026-10-13: 554 pruebas/22 suites, cobertura >=80% sobre 55 fuentes; CI success 38324403873.
- [x] F-06: colección Postman autocontenida en `postman/`, solo con contraseñas de demostración; 619 aserciones sin fallos en 011.
- [ ] F-07: README reproducible actualizado; informe terminado según usuario, pendiente de compartir para revisar contenido.
- [x] F-08: Railway, URL pública y pipeline verify/deploy/smoke exitosos; evidencia en cierre 010/auditoría.
- [ ] F-09: confirmar participación y adjunto del informe en Intu; informe preparado según usuario.
