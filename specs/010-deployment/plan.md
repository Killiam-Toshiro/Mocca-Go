# Plan 010 — despliegue en Railway y pipeline

Orden de trabajo. Cada paso se marca en [las tareas](tasks.md) solo después de verificarlo.

## 1. SDD antes del código

Registrar spec, plan, tareas y las decisiones D-51 a D-58 en `docs/decisions.md` (P-07 queda resuelta). Esperar la aprobación del grupo antes del paso 3.

## 2. Preparar Railway (manual, en el panel)

1. Crear la cuenta con GitHub para que quede verificada (trial completo).
2. Crear un proyecto vacío y añadir **PostgreSQL** (servicio `Postgres`).
3. Crear un servicio vacío **`api`** (sin conectar el repositorio, para que no haya autodeploy, D-52) y configurar en _Settings_:

   | Ajuste             | Valor                               |
   | ------------------ | ----------------------------------- |
   | Builder            | Railpack (por defecto)              |
   | Build command      | `npm run build`                     |
   | Pre-deploy command | `node dist/database/migrate.js run` |
   | Start command      | `npm run start:prod`                |
   | Healthcheck path   | `/api/v1/health`                    |
   | Restart policy     | On failure                          |
   | Réplicas           | 1                                   |

   Railpack instala las dependencias con `npm ci` y toma la versión de Node de `engines` (`>=24.15.0 <25`) y `.nvmrc`.

4. Definir las variables de la tabla de la spec. Generar `JWT_SECRET` localmente sin escribirlo en ningún archivo:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

5. _Settings → Networking_: generar el dominio público. Será `API_URL`.
6. _Project Settings → Tokens_: crear un project token para el entorno `production`.
7. En GitHub (_Settings → Secrets and variables → Actions_): secreto `RAILWAY_TOKEN`; variables `RAILWAY_SERVICE=api` y `API_URL=https://<dominio>`. Crear el environment `production`.

## 3. Código

### 3.1 IP real detrás del proxy (D-56)

- `src/config/environment.ts`: añadir `TRUST_PROXY_HOPS` a `AppEnvironment`, entero de 0 a 10 escrito solo con dígitos, por defecto `0`. Valor inválido → error que nombra la variable sin mostrar el valor.
- `src/configure-app.ts`: leer la configuración y, si es mayor que 0, aplicar `set('trust proxy', hops)` sobre la instancia de Express. Con `0` no se toca.
- Pruebas:
  - unidad: valores válidos, por defecto, inválidos (`-1`, `11`, `1.5`, `abc`, vacío);
  - Supertest: con `TRUST_PROXY_HOPS=1`, agotar las 20 peticiones/minuto desde un `X-Forwarded-For` produce `429` para esa IP, y una petición con otro `X-Forwarded-For` no recibe `429`. Con `0`, cambiar la cabecera no evita el `429`.

### 3.2 Ejemplo de configuración (D-57)

- `.env.example`: `JWT_SECRET=` vacío con un comentario que remite al comando del README; eliminar `TOTP_ENCRYPTION_KEY`; añadir `TRUST_PROXY_HOPS=0`.
- README: el comando de generación deja de crear `TOTP_ENCRYPTION_KEY`.

### 3.3 Workflow (D-52)

Añadir a `.github/workflows/ci.yml`, sin modificar `verify`:

```yaml
deploy:
  needs: verify
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  timeout-minutes: 20
  environment: production
  concurrency:
    group: deploy-production
    cancel-in-progress: false
  steps:
    - uses: actions/checkout@v7
      with:
        persist-credentials: false
    - uses: actions/setup-node@v7
      with:
        node-version-file: .nvmrc
    - name: Desplegar en Railway
      run: npx --yes @railway/cli@5.63.1 up --service "$RAILWAY_SERVICE" --ci
      env:
        RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        RAILWAY_SERVICE: ${{ vars.RAILWAY_SERVICE }}
    - name: Smoke test
      run: |
        curl --fail --silent --retry 10 --retry-delay 10 --retry-all-errors "$API_URL/api/v1/health"
        curl --fail --silent "$API_URL/api/v1/docs-json" > /dev/null
        test "$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/v1/products")" = "401"
      env:
        API_URL: ${{ vars.API_URL }}
```

`@railway/cli` 5.63.1 se fijó por ser una versión publicada hace más de dos semanas. Según la documentación de Railway, `up` devuelve código 1 si la deployment falla o se cae; confirmarlo en el primer run real (DP-01).

## 4. Verificación local

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` y `npm run test:cov` con `postgres-test`. Registrar resultados medidos.

## 5. Publicar e integrar

1. Commit con identidad real y push de `feat-despliegue`: el CI ejecuta `verify` y no `deploy` (DP-02).
2. Pull request a `main`, revisión del grupo y merge: `verify → deploy → smoke` (DP-01).
3. Seed manual una vez, desde la carpeta del proyecto enlazada con `railway link`:

   ```bash
   railway run --service api -- node dist/seed/main.js
   ```

   Con `SEED_ADMIN_PASSWORD` y `SEED_OPERATOR_PASSWORD` definidas solo en esa terminal. Si `railway run` no alcanza la red privada desde el equipo local, ejecutar el mismo comando con `railway ssh` dentro del contenedor.

4. Recorrido manual DP-05 y DP-06 contra la URL pública (Swagger o Postman).

## 6. Cierre

Actualizar README (URL de la API, URL de Swagger, sección de despliegue), trazabilidad R-08 en la 001, decisiones, tareas y `docs/commits/010.md` con: URL, enlace del run exitoso, fecha de verificación, resultados de pruebas y límites (crédito, una réplica, sin rotación de claves ni backups).
