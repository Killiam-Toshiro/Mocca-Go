# Especificación 010 — despliegue en nube y pipeline automatizado

Fecha: diseño 2026-10-12; auditoría 2026-10-13. Estado: implementado/integrado en main por PR #4 (`2ae38ac`); último main `635e928` con verify/deploy/smoke exitosos en run 38324403873. API y Swagger públicos verificados; [cierre 010](../../docs/commits/010.md). Decisiones D-51 a D-58 aprobadas por usuario; despliegue solo desde main. Rama original feat-despliegue desde 21dd53a. Cubre R-08 (15%); tareas de evidencia privada y persistencia tras redeploy permanecen separadas del despliegue comprobado.

## Alcance

Publicar la API en Railway con una base PostgreSQL gestionada, y extender el workflow de GitHub Actions para que **toda versión de `main` que supere los checks se despliegue automáticamente**, aplique sus migraciones y se compruebe con un smoke test. Una versión que no supera formato, lint, tipos, build o pruebas con cobertura **no se despliega** (escenario 12 de la 001).

Incluye además dos ajustes que el despliegue hace necesarios:

- La API se ejecuta detrás del proxy de Railway, así que el límite de 20 peticiones/minuto por IP debe usar la IP real del cliente y no la del proxy.
- `.env.example` deja de contener valores con apariencia de clave real y la variable retirada `TOTP_ENCRYPTION_KEY`.

**No cambia** ningún contrato HTTP, regla de negocio, guard, DTO ni esquema de base de datos. **No incluye** dominio propio, varias réplicas, entorno de staging, copias de seguridad automatizadas ni rotación de claves.

## Decisiones (aprobadas)

| ID   | Propuesta (recomendada)                                                                                                                                                                                                                              | Alternativa                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| D-51 | **Railway**: un proyecto con dos servicios, `api` (este repositorio) y `Postgres` (PostgreSQL gestionado por Railway), en un único entorno `production`.                                                                                             | Render o Fly.io. Se descarta por ahora porque el grupo eligió Railway.                                                            |
| D-52 | **El despliegue lo ejecuta GitHub Actions**: job `deploy` con `needs: verify`, solo en `push` a `main`, usando la Railway CLI y un _project token_. El autodeploy de Railway desde GitHub queda **desactivado**.                                     | Autodeploy de Railway con la opción de esperar al CI. Es más simple, pero la relación "pruebas → despliegue" no queda en el repo. |
| D-53 | **Configuración del servicio en el panel de Railway**, documentada valor por valor en el plan y el README. Railway ya no permite `railway.json` en servicios nuevos (Config as Code está deprecado y deja de leerse el 2026-12-01).                  | Infrastructure as Code (`.railway/railway.ts`): añade el paquete `railway` como dependencia y otro flujo de `plan/apply`.         |
| D-54 | **Migraciones como pre-deploy command**: `node dist/database/migrate.js run`, sobre el build ya compilado. Si la migración falla, la nueva versión no se activa y sigue la anterior.                                                                 | `npm run migration:run`: recompila con el CLI de Nest y depende de que las devDependencies sigan instaladas en el contenedor.     |
| D-55 | **Seed manual, una sola vez**, con la Railway CLI y contraseñas de producción propias (`SEED_ADMIN_PASSWORD`, `SEED_OPERATOR_PASSWORD`) que no se guardan en el repositorio ni en GitHub. El pipeline nunca ejecuta el seed.                         | Seed en cada despliegue: es idempotente, pero exigiría guardar las contraseñas de seed como secretos permanentes del pipeline.    |
| D-56 | **`TRUST_PROXY_HOPS`**: entero opcional de 0 a 10, por defecto `0`. En Railway vale `1`, para que Express tome la IP del cliente de `X-Forwarded-For`. Con `0` la cabecera se ignora, así nadie puede falsear su IP en local o en las pruebas.       | Fijar `trust proxy` siempre activo: en local permitiría saltarse el límite enviando un `X-Forwarded-For` inventado.               |
| D-57 | **Secretos**: `JWT_SECRET` de producción nuevo, generado solo para Railway. `.env.example` deja la variable vacía con instrucciones y elimina `TOTP_ENCRYPTION_KEY`. El valor que estuvo versionado se considera público y no se usa fuera de local. | Mantener el valor de ejemplo: cualquiera con acceso al repositorio podría firmar JWT válidos si llegara a producción.             |
| D-58 | **Una réplica** (el limitador de intentos está en memoria por proceso, D-23). Swagger sigue público en producción (D-48). Conexión a PostgreSQL por la red privada de Railway con `DB_SSL=false`.                                                    | Varias réplicas: requieren un almacenamiento compartido para el limitador, fuera de alcance.                                      |

## Costo y vigencia de la URL

Railway da una prueba de 30 días o $5 de crédito único; después pasa al plan Free con $1 de crédito al mes, que probablemente no alcanza para la API y PostgreSQL encendidos todo el mes. El plan Hobby cuesta $5 al mes. Las bases de cuentas Trial/Free se eliminan 30 días después de agotar el crédito.

Consecuencia para la entrega: la URL debe estar activa durante la evaluación. El informe indica la fecha de verificación y el grupo decide si pasa a Hobby durante ese periodo. No se presenta Railway como "gratuito".

## Contrato del pipeline (`.github/workflows/ci.yml`)

| Evento                               | `verify` (checks existentes) | `deploy`                            |
| ------------------------------------ | ---------------------------- | ----------------------------------- |
| `pull_request` a cualquier rama      | Se ejecuta                   | No se ejecuta                       |
| `push` a una rama distinta de `main` | Se ejecuta                   | No se ejecuta                       |
| `push` a `main` con `verify` exitoso | Se ejecuta                   | Se ejecuta: despliegue y smoke test |
| `push` a `main` con `verify` fallido | Falla                        | **No se ejecuta** (`needs: verify`) |

- `verify` no cambia: formato, lint, tipos, build y `test:cov` con cobertura mínima del 80% sobre PostgreSQL real.
- `deploy` usa el entorno de GitHub `production`. Dos despliegues no se cancelan entre sí: se ejecutan en orden.
- `deploy` sube el código del commit con `railway up` y espera el resultado del build y del pre-deploy. Si cualquiera falla, el job falla.
- **Smoke test** sobre la URL pública, con reintentos mientras arranca:
  - `GET /api/v1/health` → `200` y `{"status":"ok"}`;
  - `GET /api/v1/docs-json` → `200`;
  - `GET /api/v1/products` sin token → `401`.
- Secretos y variables de GitHub: secreto `RAILWAY_TOKEN` (project token del entorno `production`); variables `RAILWAY_SERVICE` y `API_URL`. Ninguna contraseña de la API ni de la base vive en GitHub.

## Configuración de producción (servicio `api` en Railway)

Ningún valor real se escribe en el repositorio, el informe ni Postman.

| Variable                                        | Valor en Railway                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `NODE_ENV`                                      | `production`                                                                           |
| `PORT`                                          | La inyecta Railway; no se define a mano                                                |
| `DB_HOST`, `DB_PORT`, `DB_NAME`                 | Referencias `${{Postgres.PGHOST}}`, `${{Postgres.PGPORT}}`, `${{Postgres.PGDATABASE}}` |
| `DB_USERNAME`, `DB_PASSWORD`                    | Referencias `${{Postgres.PGUSER}}`, `${{Postgres.PGPASSWORD}}`                         |
| `DB_SCHEMA`                                     | `public`                                                                               |
| `DB_SSL`                                        | `false` (red privada de Railway)                                                       |
| `JWT_SECRET`                                    | Nuevo, 32 bytes aleatorios en hexadecimal                                              |
| `TRUST_PROXY_HOPS`                              | `1`                                                                                    |
| `SEED_ADMIN_PASSWORD`, `SEED_OPERATOR_PASSWORD` | No se guardan en el servicio: solo en el proceso del seed manual                       |

`DB_NAME` debe cumplir la validación existente (identificador en minúsculas); el nombre por defecto de Railway (`railway`) la cumple.

## Criterios de aceptación

| ID    | Criterio                                                                                                                                                                                                                | Evidencia                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| DP-01 | Un push a `main` con checks en verde ejecuta `verify → deploy → smoke` y termina con éxito; la URL pública responde a los tres smoke tests.                                                                             | Enlace al run de Actions y URL en el README   |
| DP-02 | Un pull request o un push a otra rama ejecuta `verify` y no ejecuta `deploy`.                                                                                                                                           | Run de la rama `feat-despliegue` o del PR     |
| DP-03 | Si `verify` falla, `deploy` no se ejecuta.                                                                                                                                                                              | `needs: verify` en el workflow; run con fallo |
| DP-04 | Las migraciones se aplican en cada despliegue antes de arrancar la nueva versión; repetirlas sin cambios no altera datos.                                                                                               | Logs de pre-deploy de Railway                 |
| DP-05 | Tras el seed manual, en producción: login de `admin` → JWT → `GET /products` `200`; sin token `401`; operador que crea producto `403`; un movimiento cambia el saldo.                                                   | Recorrido Postman/Swagger contra la URL       |
| DP-06 | Los datos (productos, saldos, movimientos, sesiones revocadas) persisten después de un nuevo despliegue.                                                                                                                | Consulta antes y después de un redeploy       |
| DP-07 | Con `TRUST_PROXY_HOPS=1`, peticiones con distintos `X-Forwarded-For` cuentan como IPs distintas en el límite de login; con `0` (por defecto) la cabecera no cambia la IP. Valor inválido impide arrancar sin mostrarlo. | Pruebas Jest/Supertest nuevas                 |
| DP-08 | El repositorio no contiene secretos reales: `.env.example` sin claves con apariencia real ni `TOTP_ENCRYPTION_KEY`; el workflow solo referencia `secrets.*`/`vars.*`.                                                   | Revisión del diff                             |
| DP-09 | Todos los checks y pruebas existentes siguen pasando con cobertura ≥80% en las cuatro métricas.                                                                                                                         | `npm run test:cov` local y en CI              |

## Riesgos

- **Crédito de Railway**: si se agota, la API deja de responder; ver la sección de costo.
- **Migraciones destructivas**: las reversiones eliminan datos. En producción nunca se ejecuta `migration:revert`.
- **Errores de configuración**: una variable inválida impide arrancar y el healthcheck falla; Railway mantiene la versión anterior y el job `deploy` falla de forma visible.
- **Token de Railway**: un project token permite desplegar en ese entorno. Se guarda solo como secreto de GitHub y se revoca si se expone.
