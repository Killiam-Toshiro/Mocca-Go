import { INestApplication, ValidationPipe } from '@nestjs/common';
import { setupSwagger } from './swagger';

export interface ApplicationOptions {
  /**
   * Proxies de confianza delante de la API (Express `trust proxy`).
   * Con 0 se ignora `X-Forwarded-For` y la IP es la del socket.
   */
  trustProxyHops?: number;
}

export function configureApplication(
  app: INestApplication,
  { trustProxyHops = 0 }: ApplicationOptions = {},
): void {
  if (trustProxyHops > 0) {
    const express = app.getHttpAdapter().getInstance() as {
      set(setting: string, value: number): void;
    };
    express.set('trust proxy', trustProxyHops);
  }
  app.use(
    [
      '/api/v1/auth',
      '/api/v1/users',
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
