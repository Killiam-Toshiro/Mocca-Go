import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Product } from '../../src/products/entities/products.entity';
import { DeliveryPoint } from '../../src/delivery/entities/delivery-point.entity';
import { CatalogHarness } from './catalog-app';

export const APPROVED = '4242424242424242';
export const DECLINED = '4000000000000002';

export interface OrderBody {
  id: string;
  number: number;
  status: string;
  total: number;
  items: {
    productId: string;
    sku: string;
    name: string;
    category: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    components: { sku: string; quantity: number }[];
  }[];
  delivery: {
    pointId: string;
    pointName: string;
    zoneName: string;
    floor: number | null;
    deliveryNote: string | null;
    etaAt?: string | null;
    courier?: { fullName: string; phone: string; whatsappUrl: string } | null;
  };
  note: string | null;
  survey?: { rating: number; comment: string | null; createdAt: string } | null;
  payment: { method: string; last4: string; status: string };
  customer: { name: string; phone: string };
  cancelReason: string | null;
  failureReason?: string | null;
  events: { status: string; at: string }[];
}

export interface Customer {
  id: string;
  auth: string;
}

export interface Fixture {
  capu: Product;
  pan: Product;
  combo: string;
  point: DeliveryPoint;
  flat: DeliveryPoint;
}

/** Productos, combo y puntos de entrega de partida para las pruebas de pedidos. */
export async function fixture(harness: CatalogHarness): Promise<Fixture> {
  const capu = await harness.simple('CAF-CAPU', {
    name: 'Capuchino',
    price: 4500,
    cost: 1600,
    stock: 10,
  });
  const pan = await harness.simple('PAN-PAND', {
    name: 'Pandebono',
    category: 'panaderia',
    price: 2500,
    cost: 900,
    stock: 10,
  });
  const created = await harness
    .send('post', '/products', {
      sku: 'CMB-UNO',
      name: 'Combo Uno',
      category: 'combo',
      price: 6000,
      components: [
        { productId: capu.id, quantity: 1 },
        { productId: pan.id, quantity: 1 },
      ],
    })
    .expect(201);
  const point = await harness.point('Edificio A', { floors: 3, hint: null });
  const flat = await harness.point('Canchas', { floors: null, hint: null });
  return {
    capu,
    pan,
    combo: (created.body as { id: string }).id,
    point,
    flat,
  };
}

export function placeOrder(
  harness: CatalogHarness,
  who: Customer | string,
  body: object,
  key: string | null = randomUUID(),
) {
  const auth = typeof who === 'string' ? who : who.auth;
  const call = request(harness.server)
    .post('/api/v1/orders')
    .set('Authorization', auth);
  if (key !== null) call.set('Idempotency-Key', key);
  return call.send(body);
}

export function validBody(f: Fixture, extra: object = {}): object {
  return {
    items: [{ productId: f.capu.id, quantity: 1 }],
    pointId: f.point.id,
    floor: 2,
    payment: { method: 'tarjeta_demo', cardNumber: APPROVED },
    ...extra,
  };
}

/**
 * Crea pedidos en los puntos dados y los deja `listo` (directo en la base: la
 * cocina ya tiene sus propias pruebas). Devuelve los pedidos en orden de creación.
 */
export async function readyOrders(
  harness: CatalogHarness,
  who: Customer,
  f: Fixture,
  points: { id: string; floors: number | null }[],
): Promise<OrderBody[]> {
  const orders: OrderBody[] = [];
  for (const point of points) {
    const response = await placeOrder(
      harness,
      who,
      validBody(f, {
        pointId: point.id,
        floor: point.floors ? 1 : undefined,
      }),
    ).expect(201);
    orders.push(response.body as OrderBody);
  }
  await harness.context.source.query(
    `UPDATE "${harness.context.ownedSchema}"."orders" SET status = 'listo' WHERE id = ANY($1::uuid[])`,
    [orders.map((order) => order.id)],
  );
  return orders;
}

export interface Forced {
  status: string;
  /** Cuándo se creó (si se omite, queda la hora real). */
  createdAt?: Date;
  /** Hora de cada evento de estado que se quiera registrar. */
  events?: Partial<Record<string, Date>>;
  paymentStatus?: 'aprobado' | 'reembolsado';
  failureReason?: string;
}

/**
 * Deja un pedido en el estado y con la historia indicados, directo en la base
 * (las pruebas de cocina y despacho ya cubren las transiciones reales). Los
 * estados de reparto reciben una ronda de apoyo.
 */
export async function forceOrder(
  harness: CatalogHarness,
  orderId: string,
  who: Customer,
  forced: Forced,
): Promise<void> {
  const schema = harness.context.ownedSchema;
  const source = harness.context.source;
  let roundId: string | null = null;
  if (['en_camino', 'entregado', 'no_entregado'].includes(forced.status)) {
    const [round] = await source.query<{ id: string }[]>(
      `INSERT INTO "${schema}"."dispatch_rounds"
         (courier_id, zone_id, zone_name, status, started_at, eta_at, finished_at)
       SELECT (SELECT id FROM "${schema}"."users" WHERE role = 'repartidor' LIMIT 1),
              p.zone_id, o.zone_name, 'finalizada'::varchar, now() - interval '1 hour', now() - interval '45 minutes', now() - interval '30 minutes'
         FROM "${schema}"."orders" o JOIN "${schema}"."delivery_points" p ON p.id = o.point_id
        WHERE o.id = $1
       RETURNING id`,
      [orderId],
    );
    roundId = round.id;
  }
  await source.query(
    `UPDATE "${schema}"."orders"
        SET status = $2::varchar, round_id = $3, payment_status = $4::varchar,
            failure_reason = $5, created_at = COALESCE($6::timestamptz, created_at),
            cancelled_by = CASE WHEN $2::varchar = 'cancelado' THEN $7::uuid END,
            cancel_reason = CASE WHEN $2::varchar = 'cancelado' THEN 'Cancelado en la prueba' END
      WHERE id = $1`,
    [
      orderId,
      forced.status,
      roundId,
      forced.paymentStatus ??
        (forced.status === 'cancelado' ? 'reembolsado' : 'aprobado'),
      forced.failureReason ??
        (forced.status === 'no_entregado' ? 'No contestó' : null),
      forced.createdAt ?? null,
      who.id,
    ],
  );
  await source.query(
    `DELETE FROM "${schema}"."order_events" WHERE order_id = $1`,
    [orderId],
  );
  for (const [status, at] of Object.entries(forced.events ?? {}))
    await source.query(
      `INSERT INTO "${schema}"."order_events" (order_id, status, user_id, created_at) VALUES ($1, $2, $3, $4)`,
      [orderId, status, who.id, at],
    );
}
