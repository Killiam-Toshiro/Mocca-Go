import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RuntimeEnvironment } from './config/runtime-environment';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/** Ruta de Swagger UI; el JSON queda en la misma ruta con sufijo `-json`. */
export const SWAGGER_PATH = 'api/v1/docs';
/** Nombre del esquema de seguridad que usan las rutas protegidas. */
export const BEARER_SCHEME = 'bearer';

/** Duración legible: minutos exactos cuando es posible, si no segundos. */
export function describeDuration(seconds: number): string {
  if (seconds % 60 !== 0) return `${seconds} segundos`;
  const minutes = seconds / 60;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hora' : `${hours} horas`;
  }
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const environment =
    app.get<ConfigService<RuntimeEnvironment, true>>(ConfigService);
  const ttl = describeDuration(
    environment.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
  );
  const config = new DocumentBuilder()
    .setTitle('API de Mocca Go')
    .setDescription(
      'Café y snacks a domicilio en el campus de Icesi: usuarios y roles ' +
        '(admin, operador de cocina, repartidor y cliente), catálogo e ' +
        'inventario. Obtén un JWT con `POST /api/v1/auth/login`, pulsa ' +
        '**Authorize** y pégalo para probar las rutas protegidas. ' +
        `El token dura ${ttl} y \`logout\` lo revoca.`,
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
    customSiteTitle: 'API de Mocca Go — Swagger',
    // No guardar el JWT en localStorage del navegador.
    swaggerOptions: { persistAuthorization: false },
  });
}
