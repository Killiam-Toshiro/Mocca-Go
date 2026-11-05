import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsInt, IsString, Min, MinLength } from 'class-validator';
import { Server } from 'node:http';
import request from 'supertest';
import { configureApplication } from '../src/configure-app';

class ValidationProbeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

// Este controlador vive en test/ y nunca se incluye en el build distribuido.
@Controller('validation-probe')
class ValidationProbeController {
  @Post()
  create(@Body() dto: ValidationProbeDto) {
    return { ...dto, isDto: dto instanceof ValidationProbeDto };
  }
}

describe('Validación global HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ValidationProbeController],
    }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('acepta los campos válidos y transforma el cuerpo a instancia del DTO', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/v1/validation-probe')
      .send({ name: 'Producto de prueba', quantity: 2 })
      .expect(201)
      .expect({ name: 'Producto de prueba', quantity: 2, isDto: true });
  });

  it('rechaza campos no declarados en lugar de aceptarlos silenciosamente', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/v1/validation-probe')
      .send({ name: 'Producto', quantity: 2, role: 'admin' })
      .expect(400);
  });

  it.each([
    { name: '', quantity: 2 },
    { name: 123, quantity: 2 },
    { name: 'Producto', quantity: 0 },
    { name: 'Producto', quantity: -1 },
    { name: 'Producto', quantity: 1.5 },
    { name: 'Producto', quantity: '2' },
    {},
  ])('rechaza un DTO inválido (%j)', async (body) => {
    await request(app.getHttpServer() as Server)
      .post('/api/v1/validation-probe')
      .send(body)
      .expect(400);
  });
});
