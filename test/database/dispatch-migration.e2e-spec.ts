import { Dispatch1791244808000 } from '../../src/database/migrations/1791244808000-dispatch';
import { Customer } from '../../src/customers/entities/customer.entity';
import { DeliveryPoint } from '../../src/delivery/entities/delivery-point.entity';
import { DeliveryZone } from '../../src/delivery/entities/delivery-zone.entity';
import { User } from '../../src/users/entities/user.entity';
import {
  createTestDatabase,
  disposeTestDatabase,
  TestDatabase,
} from '../helpers/database';

describe('Migración de despacho (CA-01, CA-02)', () => {
  let context: TestDatabase;
  let courierId: string;
  let customerId: string;
  let zoneId: string;
  let pointId: string;

  beforeEach(async () => {
    context = await createTestDatabase();
    await context.source.runMigrations();
    const users = context.source.getRepository(User);
    courierId = (
      await users.save({
        username: 'rep',
        role: 'repartidor',
        passwordHash: 'x',
      })
    ).id;
    customerId = (
      await users.save({ username: 'cli', role: 'cliente', passwordHash: 'x' })
    ).id;
    await context.source.getRepository(Customer).save({
      userId: customerId,
      email: 'cli@example.com',
      fullName: 'Cliente Uno',
      phone: '+573001112233',
    });
    zoneId = (
      await context.source.getRepository(DeliveryZone).save({ name: 'Zona 1' })
    ).id;
    pointId = (
      await context.source
        .getRepository(DeliveryPoint)
        .save({ zoneId, name: 'Edificio A', floors: 2 })
    ).id;
  });
  afterEach(async () => {
    if (context) await disposeTestDatabase(context);
  });

  const q = (name: string) => `"${context.ownedSchema}"."${name}"`;
  const rejected = (sql: string, params: unknown[] = []) =>
    expect(context.source.query(sql, params)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
  const insertRound = (status = 'activa', finished: string | null = null) =>
    context.source.query<{ id: string }[]>(
      `INSERT INTO ${q('dispatch_rounds')}
         (courier_id, zone_id, zone_name, status, started_at, eta_at, finished_at)
       VALUES ($1, $2, 'Zona 1', $3, now(), now() + interval '15 minutes', $4)
       RETURNING id`,
      [courierId, zoneId, status, finished],
    );
  const insertOrder = async (
    status: string,
    roundId: string | null,
    reason: string | null = null,
  ) =>
    context.source.query<unknown[]>(
      `INSERT INTO ${q('orders')}
         (customer_id, status, point_id, point_name, zone_name, floor, total,
          payment_method, payment_last4, payment_status, idempotency_key, request_hash,
          round_id, failure_reason)
       VALUES ($1, $2, $3, 'Edificio A', 'Zona 1', 1, 4500, 'tarjeta_demo', '4242',
               'aprobado', gen_random_uuid(), $4, $5, $6)`,
      [customerId, status, pointId, 'a'.repeat(64), roundId, reason],
    );
  const revert = async () => {
    const runner = context.source.createQueryRunner();
    try {
      await new Dispatch1791244808000().down(runner);
    } finally {
      await runner.release();
    }
  };
  const hasTable = async () =>
    (
      await context.source.query<{ present: boolean }[]>(
        `SELECT to_regclass('${q('dispatch_rounds')}') IS NOT NULL AS present`,
      )
    )[0].present;

  it('CA-01: down() aborta con rondas o con contacto del personal y, sin ellos, limpia', async () => {
    expect(await hasTable()).toBe(true);
    await insertRound();
    await expect(revert()).rejects.toThrow(/existen rondas/);
    await context.source.query(`DELETE FROM ${q('dispatch_rounds')}`);
    await context.source.query(
      `UPDATE ${q('users')} SET phone = '+573001234567' WHERE id = $1`,
      [courierId],
    );
    await expect(revert()).rejects.toThrow(/teléfono o nombre/);
    await context.source.query(`UPDATE ${q('users')} SET phone = NULL`);
    await revert();
    expect(await hasTable()).toBe(false);
    const columns = await context.source.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND column_name IN ('phone', 'full_name', 'round_id', 'failure_reason')
         AND table_name IN ('users', 'orders')`,
      [context.ownedSchema],
    );
    expect(columns).toEqual([]);
  });

  it('CA-02: las restricciones rechazan datos incoherentes directamente en la base', async () => {
    await rejected(
      `INSERT INTO ${q('dispatch_rounds')} (courier_id, zone_id, zone_name, status, started_at, eta_at)
       VALUES ($1, $2, 'Zona 1', 'perdida', now(), now() + interval '1 minute')`,
      [courierId, zoneId],
    );
    await rejected(
      `INSERT INTO ${q('dispatch_rounds')} (courier_id, zone_id, zone_name, status, started_at, eta_at)
       VALUES ($1, $2, 'Zona 1', 'finalizada', now(), now() + interval '1 minute')`,
      [courierId, zoneId],
    );
    await rejected(
      `INSERT INTO ${q('dispatch_rounds')} (courier_id, zone_id, zone_name, started_at, eta_at)
       VALUES ($1, $2, 'Zona 1', now(), now())`,
      [courierId, zoneId],
    );
    const [round] = await insertRound();
    await rejected(insertOrderSql('no_entregado', true), [
      customerId,
      pointId,
      round.id,
    ]);
    await rejected(insertOrderSql('en_camino', false), [
      customerId,
      pointId,
      round.id,
    ]);
    await expect(insertOrder('entregado', null)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await expect(insertOrder('listo', round.id)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await insertOrder('en_camino', round.id);
    await insertOrder('no_entregado', round.id, 'Sin respuesta');
    await rejected(
      `UPDATE ${q('users')} SET phone = '3001234567' WHERE id = $1`,
      [courierId],
    );
    await rejected(`UPDATE ${q('users')} SET full_name = '   ' WHERE id = $1`, [
      courierId,
    ]);
    await context.source.query(
      `UPDATE ${q('users')} SET phone = '+573001234567', full_name = 'Carlos Gómez' WHERE id = $1`,
      [courierId],
    );
  });

  it('CA-02: no se borra un repartidor, una zona ni una ronda con pedidos', async () => {
    const [round] = await insertRound();
    await insertOrder('en_camino', round.id);
    for (const sql of [
      `DELETE FROM ${q('users')} WHERE id = $1`,
      `DELETE FROM ${q('dispatch_rounds')} WHERE id = $1`,
    ])
      await expect(
        context.source.query(sql, [
          sql.includes('users') ? courierId : round.id,
        ]),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });
    await expect(
      context.source.query(`DELETE FROM ${q('delivery_zones')} WHERE id = $1`, [
        zoneId,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
  });

  function insertOrderSql(status: string, withReason: boolean): string {
    return `INSERT INTO ${q('orders')}
         (customer_id, status, point_id, point_name, zone_name, floor, total,
          payment_method, payment_last4, payment_status, idempotency_key, request_hash,
          round_id, failure_reason)
       VALUES ($1, '${status}', $2, 'Edificio A', 'Zona 1', 1, 4500, 'tarjeta_demo', '4242',
               'aprobado', gen_random_uuid(), '${'a'.repeat(64)}', $3, ${
                 withReason ? 'NULL' : "'Motivo sin estado'"
               })`;
  }
});
