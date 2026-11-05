# Especificación 002 — base ejecutable

Fecha: 2026-10-06. Incremento: commit 2.

## Alcance

Crear una API NestJS en TypeScript con Express y módulos independientes, sin base de datos todavía. Se conserva el alcance de inventario definido en la especificación 001. La indicación del usuario de avanzar al segundo commit cierra la revisión inicial.

## Configuración y arranque

| Variable   | Valor por defecto | Valores permitidos                                                              |
| ---------- | ----------------- | ------------------------------------------------------------------------------- |
| `NODE_ENV` | `development`     | `development`, `test`, `production`                                             |
| `PORT`     | `3000`            | Texto compuesto únicamente por dígitos que represente un entero entre 1 y 65535 |

Las variables de proceso tienen precedencia sobre `.env`. En pruebas se ignora `.env` para evitar depender de credenciales o ajustes locales. La validación devuelve `PORT` como número; valores vacíos, decimales, negativos, texto y valores fuera de rango impiden arrancar. Los errores identifican la variable y su regla, sin reproducir el valor recibido ni otras variables.

El servidor escucha en `0.0.0.0` y el puerto configurado. El prefijo es `/api/v1`. Se registran hooks de cierre para liberar los recursos de Nest al recibir señales. Un fallo de arranque devuelve código de proceso distinto de cero.

## Endpoint disponible

`GET /api/v1/health`, público, sin cuerpo ni parámetros requeridos.

Respuesta `200`, JSON exacto:

```json
{
  "status": "ok"
}
```

Indica que el proceso HTTP atiende peticiones. No indica disponibilidad de PostgreSQL, no muestra variables de entorno y no consulta servicios externos. `/health` y rutas inexistentes responden `404`.

## Validación transversal

Una `ValidationPipe` global transforma objetos a DTOs, admite únicamente campos declarados y devuelve `400` ante campos adicionales o valores inválidos. No habilita conversión implícita de cualquier tipo: las conversiones necesarias deben declararse en el DTO del incremento correspondiente.

No se crea un endpoint artificial de validación en la API. Las pruebas usan un controlador exclusivo del entorno de pruebas para verificar el pipe antes de incorporar rutas de negocio.

## Criterios de aceptación

- B-01: `npm ci` instala exactamente el lockfile en Node 24 y npm 11 sin conflictos de peer dependencies.
- B-02: aplicación y pruebas compilan en TypeScript estricto; lint y formato verifican sin modificar archivos.
- B-03: health devuelve el JSON previsto; el prefijo y `404` se verifican con Supertest.
- B-04: valores de configuración válidos se aceptan; inválidos fallan sin divulgar datos; se prueban valores por defecto y límites del puerto.
- B-05: el pipe rechaza campos extra y tipos inválidos y admite un DTO válido; el controlador de prueba no se distribuye en `dist`.
- B-06: Jest ejecuta unidades y Supertest pruebas HTTP; la cobertura conjunta cubre todo `src/**/*.ts` salvo tests, con umbral global del 80% en líneas, sentencias, funciones y ramas. No se excluye el arranque ni un módulo sin tests.
- B-07: CI instala, revisa formato/lint, compila, ejecuta pruebas y aplica el umbral; no contiene todavía un job de despliegue.
- B-08: README incluye requisitos, configuración, comandos reproducibles y respuesta de health; overview registra verificaciones reales y limitaciones.

## Fuera del incremento

PostgreSQL, ORM, seed, JWT, 2FA, usuarios, inventario y despliegue siguen pendientes. La cobertura de esta base no acredita el 80% de una API de inventario que todavía no está implementada.
