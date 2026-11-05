# Especificación 009 — documentación OpenAPI con Swagger

Fecha: 2026-10-12. Estado: especificado antes del código e implementado/verificado localmente (450 pruebas en 18 suites, cobertura >=80%). Commit local; push y CI sujetos a autorización. Rama `feature-swagger`, creada desde `2a86b32` (merge de catálogo, movimientos y retiro del 2FA). El usuario aprobó las opciones recomendadas: Swagger siempre activo, decoradores explícitos y esquemas de respuesta.

## Alcance

Publicar un documento OpenAPI 3 generado a partir de los controladores y DTOs existentes, y una interfaz Swagger UI para leerlo y probar la API desde el navegador. Avanza R-07 (cada endpoint documentado con parámetros, respuestas, autenticación y autorización) y facilita R-06, porque el JSON se puede importar en Postman.

No cambia ningún contrato HTTP, regla de negocio, guard, validación ni esquema de base de datos. No incluye la colección Postman, el informe final ni el despliegue.

## Contratos HTTP relativos a /api/v1

| Ruta             | Acceso  | Resultado                                                                      |
| ---------------- | ------- | ------------------------------------------------------------------------------ |
| `GET /docs`      | Público | `200` HTML de Swagger UI con los recursos servidos localmente, sin CDN         |
| `GET /docs-json` | Público | `200` documento OpenAPI 3 en JSON, con las rutas de la API incluido el prefijo |

Ambas rutas están activas en todos los entornos (`development`, `test` y `production`). El documento describe solo contratos públicos: no incluye secretos, valores de `.env`, hashes, columnas internas ni ejemplos con contraseñas reales. Probar una ruta protegida desde la UI exige pegar un JWT obtenido con `POST /auth/login` en **Authorize**; Swagger no omite guards, validaciones ni límites de intentos.

## Contenido del documento

- `info`: título `API de inventario`, versión `1.0` (la versión 1 de la API, prefijo `/api/v1`) y descripción breve del flujo de autenticación.
- Esquema de seguridad `bearer` (`type: http`, `scheme: bearer`, `bearerFormat: JWT`). Toda ruta con `AuthGuard` declara ese requisito; `GET /health` y `POST /auth/login` no.
- Etiquetas por módulo: `health`, `auth`, `users`, `products`, `movements`.
- Cada operación tiene un resumen que indica qué rol puede usarla y las respuestas reales que produce: éxito (`200`, `201` o `204`) y los errores de los specs 004 a 008 (`400`, `401`, `403`, `404`, `409`, `429`) que correspondan a esa ruta.
- Cuerpos y queries documentados con los mismos límites que validan los DTOs: patrones de username y SKU, longitudes, enumeraciones de rol y tipo de movimiento, UUID v4, rango de cantidad y paginación (`page` 1–10000, `limit` 1–100, valores por defecto 1 y 20).
- Esquemas de respuesta para producto, usuario seguro, movimiento, identidad, login, páginas `{data,page,limit,total,totalPages}` y error `{statusCode,message,error}`. Coinciden campo a campo con las proyecciones existentes, sin campos sensibles.

## Criterios de aceptación

- S-01: `GET /api/v1/docs` responde `200` con HTML de Swagger UI y `GET /api/v1/docs-json` responde `200` con OpenAPI 3.
- S-02: el documento contiene exactamente las 14 operaciones existentes (1 health, 3 auth, 3 users, 5 products y 2 movements), ni más ni menos, con el prefijo `/api/v1`. Desde [la especificación 011](../011-crud-completion/spec.md) son 19 (D-64).
- S-03: las 12 operaciones protegidas declaran el esquema bearer; health y login no. Las operaciones exclusivas de admin documentan `403`, y todas las protegidas documentan `401`.
- S-04: los DTOs de entrada documentan campos obligatorios, patrones, longitudes, enumeraciones y rangos coherentes con class-validator; los esquemas de respuesta no contienen `password`, `passwordHash`, `seedKey` ni datos de sesión.
- S-05: los decoradores de documentación no alteran el comportamiento: `whitelist` y `forbidNonWhitelisted` siguen rechazando campos extra y todas las pruebas anteriores pasan.
- S-06: formato, lint, tipos, build y `test:cov` pasan con cobertura >=80% en las cuatro métricas, sin excluir archivos nuevos.
- S-07: README, decisiones, tareas, trazabilidad y overview `docs/commits/009.md` actualizados; commit local registrado. Push y CI quedan sujetos a autorización.
