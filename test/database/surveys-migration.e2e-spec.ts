import { Surveys1791244809000 } from '../../src/database/migrations/1791244809000-surveys';
import { Customer } from '../../src/customers/entities/customer.entity';
import { DeliveryPoint } from '../../src/delivery/entities/delivery-point.entity';
import { DeliveryZone } from '../../src/delivery/entities/delivery-zone.entity';
import { User } from '../../src/users/entities/user.entity';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

describe('Migración de encuestas (CA-01, CA-02)', () => {
  let context: TestDatabase;
  let customerId: string;
  let orderId: string;

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
    customerId = (
      await context.source
        .getRepository(User)
        .save({ username: 'cli', role: 'cliente', passwordHash: 'x' })
    ).id;
    await context.source.getRepository(Customer).save({
      userId: customerId,
      email: 'cli@example.com',
      fullName: 'Cliente Uno',
      phone: '+573001112233',
    });
    const zone = await context.source
      .getRepository(DeliveryZone)
      .save({ name: 'Zona 1' });
    const point = await context.source
      .getRepository(DeliveryPoint)
      .save({ zoneId: zone.id, name: 'Edificio A', floors: 2 });
    orderId = await insertOrder(point.id);
  });
  afterEach(async () => {
    if (context) await disposeTestDatabase(context);
  });

  const q = (name: string) => `"${context.ownedSchema}"."${name}"`;
  const insertOrder = async (pointId: string) =>
    (
      await context.source.query<{ id: string }[]>(
        `INSERT INTO ${q('orders')}
           (customer_id, status, point_id, point_name, zone_name, floor, total,
            payment_method, payment_last4, payment_status, idempotency_key, request_hash)
         VALUES ($1, 'recibido', $2, 'Edificio A', 'Zona 1', 1, 4500, 'tarjeta_demo', '4242',
                 'aprobado', gen_random_uuid(), $3)
         RETURNING id`,
        [customerId, pointId, 'a'.repeat(64)],
      )
    )[0].id;
  const survey = (rating: number, comment: string | null, order = orderId) =>
    context.source.query(
      `INSERT INTO ${q('order_surveys')} (order_id, customer_id, rating, comment) VALUES ($1, $2, $3, $4)`,
      [order, customerId, rating, comment],
    );
  const present = async () =>
    (
      await context.source.query<{ present: boolean }[]>(
        `SELECT to_regclass('${q('order_surveys')}') IS NOT NULL AS present`,
      )
    )[0].present;
  const revert = async () => {
    const runner = context.source.createQueryRunner();
    try {
      await new Surveys1791244809000().down(runner);
    } finally {
      await runner.release();
    }
  };

  it('CA-01: down() aborta con respuestas y, sin ellas, elimina la tabla', async () => {
    expect(await present()).toBe(true);
    await survey(5, 'Bien');
    await expect(revert()).rejects.toThrow(/existen respuestas/);
    expect(await present()).toBe(true);
    await context.source.query(`DELETE FROM ${q('order_surveys')}`);
    await revert();
    expect(await present()).toBe(false);
  });

  it('CA-02: rechaza calificaciones y comentarios inválidos y una segunda respuesta', async () => {
    for (const rating of [0, 6, -1])
      await expect(survey(rating, null)).rejects.toMatchObject({
        driverError: { code: '23514' },
      });
    for (const comment of ['', '   '])
      await expect(survey(3, comment)).rejects.toMatchObject({
        driverError: { code: '23514' },
      });
    await expect(survey(3, 'x'.repeat(301))).rejects.toMatchObject({
      driverError: { code: '22001' },
    });
    await survey(3, 'x'.repeat(300));
    await expect(survey(4, null)).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
  });

  it('CA-02: no se borra un pedido ni un cliente con respuesta', async () => {
    await survey(5, null);
    await expect(
      context.source.query(`DELETE FROM ${q('orders')} WHERE id = $1`, [
        orderId,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    await expect(
      context.source.query(`DELETE FROM ${q('users')} WHERE id = $1`, [
        customerId,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
  });
});
