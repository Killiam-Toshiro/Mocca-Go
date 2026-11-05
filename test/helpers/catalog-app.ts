import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { Session } from '../../src/auth/entities/session.entity';
import { configureApplication } from '../../src/configure-app';
import { Product } from '../../src/products/entities/products.entity';
import { hashPassword } from '../../src/seed/password';
import { User, UserRole } from '../../src/users/entities/user.entity';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from './database';

export interface ProductBody {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  cost: number;
  costPercent: number | null;
  soldOut: boolean;
  available: boolean;
  active: boolean;
  stock: number;
  components: {
    productId: string;
    sku: string;
    name: string;
    quantity: number;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface MenuItemBody {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  available: boolean;
  components: { name: string; quantity: number }[];
}

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

/** Aplicación real con PostgreSQL aislado y un token por rol. */
export class CatalogHarness {
  context!: TestDatabase;
  app!: INestApplication;
  server!: Server;
  private tokens = new Map<UserRole, string>();

  async start(): Promise<void> {
    this.context = await createTestDatabase();
    await this.context.source.runMigrations();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(this.context.source)
      .compile();
    this.app = module.createNestApplication({ logger: false });
    configureApplication(this.app);
    await this.app.listen(0, '127.0.0.1');
    this.server = this.app.getHttpServer() as Server;
    const passwordHash = await hashPassword('Integration-only-password');
    for (const role of [
      'admin',
      'operador',
      'repartidor',
      'cliente',
    ] as const) {
      const owner = await this.context.source
        .getRepository(User)
        .save({ username: `rol_${role}`, role, passwordHash });
      const session = await this.context.source
        .getRepository(Session)
        .save({ userId: owner.id, expiresAt: new Date(Date.now() + 900_000) });
      this.tokens.set(
        role,
        await this.app
          .get(JwtService)
          .signAsync({ sub: owner.id, sid: session.id, typ: 'access' }),
      );
    }
  }

  async stop(): Promise<void> {
    if (this.app) await this.app.close();
    if (this.context) await disposeTestDatabase(this.context);
  }

  as(role: UserRole): string {
    return `Bearer ${this.tokens.get(role)}`;
  }

  get(path: string, role?: UserRole) {
    const call = request(this.server).get(`/api/v1${path}`);
    return role ? call.set('Authorization', this.as(role)) : call;
  }

  send(
    method: 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
    role: UserRole = 'admin',
  ) {
    const agent = request(this.server);
    return agent[method](`/api/v1${path}`)
      .set('Authorization', this.as(role))
      .send(body);
  }

  /** Crea un producto simple directamente en la base (sin pasar por la API). */
  simple(sku: string, extra: Partial<Product> = {}): Promise<Product> {
    return this.context.source.getRepository(Product).save({
      sku,
      name: `Producto ${sku}`,
      category: 'cafe',
      price: 4000,
      cost: 1000,
      stock: 10,
      ...extra,
    });
  }

  stored(id: string): Promise<Product> {
    return this.context.source.getRepository(Product).findOneByOrFail({ id });
  }
}
