# Tareas 010 — despliegue en nube y pipeline

Una marca completada corresponde a trabajo verificado, no a comportamiento previsto.

## SDD

- [x] DP-T01: spec, plan y tareas escritos antes del código, con criterios DP-01 a DP-09 y decisiones propuestas D-51 a D-58.
- [x] DP-T02: usuario aprueba D-51 a D-58 el 2026-10-12 (despliegue solo desde `main`); registradas en `docs/decisions.md`, P-07 cerrada.

## Railway y GitHub (manual)

- [x] DP-T03: cuenta verificada, proyecto con servicios `Postgres` y `api`, configuración de build/pre-deploy/start/healthcheck según el plan; autodeploy desde GitHub desactivado.
- [x] DP-T04: variables de producción definidas (con `JWT_SECRET` nuevo y `TRUST_PROXY_HOPS=1`), dominio público generado en el puerto 8080 con `PORT=8080`. Configurado por el usuario el 2026-10-12; se comprueba en el primer despliegue.
- [x] DP-T05: project token creado; secreto `RAILWAY_TOKEN`, variables `RAILWAY_SERVICE` y `API_URL` y environment `production` configurados en GitHub.

## Código

- [x] DP-T06: `TRUST_PROXY_HOPS` validada y aplicada en `configureApplication`; 14 casos de unidad y 4 de Supertest con PostgreSQL (DP-07). La prueba principal falla si se quita el ajuste.
- [x] DP-T07: `.env.example` sin `JWT_SECRET` ni `TOTP_ENCRYPTION_KEY`, con `TRUST_PROXY_HOPS=0`; README con la variable y la sección de despliegue (DP-08).
- [x] DP-T08: `@railway/cli` 5.63.1 fijada; job `deploy` con `needs: verify`, solo en push a `main`, environment `production` y smoke test; workflow validado con actionlint (DP-01 a DP-03 pendientes de ejecución real).
- [x] DP-T09: formato, lint, tipos y build correctos; 468 pruebas en 19 suites con PostgreSQL 16 y Node 24.21.0; cobertura 98,53% sentencias, 94,69% ramas, 99,12% funciones y 98,93% líneas (DP-09). Simulacro compilado con `NODE_ENV=production`: migraciones repetidas sin cambios, seed, health/docs `200`, `401` sin token, `200` con token y límite por IP separado con `TRUST_PROXY_HOPS=1`.

## Publicación y evidencia

- [x] DP-T10: feat-despliegue publicado (6a1fe79 y cambios de workflow); integrado en main. Workflow solo despliega en push a main; comprobar run específico de rama si se solicita esa evidencia adicional.
- [x] DP-T11: merge de PR #4 en 2ae38ac; verify/deploy/smoke success en run 38324403873 del main 635e928, comprobado el 2026-10-13. Logs privados de migraciones pre-deploy no inspeccionados en esta auditoría.
- [ ] DP-T12: seed manual ejecutado una vez con contraseñas de producción propias, sin registrarlas.
- [ ] DP-T13: usuario confirma Postman exitoso en producción; health/readiness/docs 200 y products sin token 401 comprobados directamente. Falta adjuntar evidencia específica de persistencia tras redeploy (DP-06).
- [ ] DP-T14: evidencia de que un `verify` fallido no despliega (DP-03).

## Cierre

- [x] DP-T15: cierre documental del 2026-10-13 con URL, run 38324403873, README/trazabilidad y docs/commits/010.md actualizados; evidencia directa y reportada separadas.
- [ ] DP-T16: presentar overview y revisión del grupo antes del informe final.
