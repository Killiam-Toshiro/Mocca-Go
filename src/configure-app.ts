import { INestApplication, ValidationPipe } from '@nestjs/common';
import { setupSwagger } from './swagger';

export interface ApplicationOptions {
  /**
   * Proxies de confianza delante de la API (Express `trust proxy`).
   * Con 0 se ignora `X-Forwarded-For` y la IP es la del socket.
   */
  trustProxyHops?: number;
  /**
   * Orígenes del frontend autorizados por CORS (lista exacta, sin comodín).
   * Vacío mantiene CORS desactivado.
   */
  corsOrigins?: string[];
}

export function configureApplication(
  app: INestApplication,
  { trustProxyHops = 0, corsOrigins = [] }: ApplicationOptions = {},
): void {
  if (trustProxyHops > 0) {
    const express = app.getHttpAdapter().getInstance() as {
      set(setting: string, value: number): void;
    };
    express.set('trust proxy', trustProxyHops);
  }
  if (corsOrigins.length > 0) {
    // Se registra antes que el resto del middleware para que el preflight
    // OPTIONS se responda sin pasar por guards ni validación.
    app.enableCors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      credentials: false,
      maxAge: 600,
    });
  }
  app.use(
    [
      '/api/v1/auth',
      '/api/v1/customers',
      '/api/v1/users',
      '/api/v1/products',
      '/api/v1/menu',
      '/api/v1/delivery-zones',
      '/api/v1/delivery-points',
      '/api/v1/orders',
      '/api/v1/kitchen',
      '/api/v1/dispatch',
      '/api/v1/movements',
      '/api/v1/health/ready',
    ],
    (
      _request: unknown,
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  setupSwagger(app);
  app.enableShutdownHooks();
}
