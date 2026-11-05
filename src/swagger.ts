import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/** Ruta de Swagger UI; el JSON queda en la misma ruta con sufijo `-json`. */
export const SWAGGER_PATH = 'api/v1/docs';
/** Nombre del esquema de seguridad que usan las rutas protegidas. */
export const BEARER_SCHEME = 'bearer';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('API de inventario')
    .setDescription(
      'Productos, existencias y movimientos de inventario. Obtén un JWT con ' +
        '`POST /api/v1/auth/login`, pulsa **Authorize** y pégalo para probar ' +
        'las rutas protegidas. El token dura 15 minutos y `logout` lo revoca.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT devuelto por POST /api/v1/auth/login.',
      },
      BEARER_SCHEME,
    )
    .build();
  return SwaggerModule.createDocument(app, config);
}

/**
 * Publica Swagger UI en /api/v1/docs y el documento en /api/v1/docs-json.
 * El documento se genera en la primera petición y solo describe contratos:
 * los guards, validaciones y límites de cada ruta siguen aplicándose.
 */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, () => buildOpenApiDocument(app), {
    customSiteTitle: 'API de inventario — Swagger',
    // No guardar el JWT en localStorage del navegador.
    swaggerOptions: { persistAuthorization: false },
  });
}
