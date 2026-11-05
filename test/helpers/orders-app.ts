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
  };
  note: string | null;
  payment: { method: string; last4: string; status: string };
  customer: { name: string; phone: string };
  cancelReason: string | null;
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
