import { CatalogHarness, ErrorBody } from '../helpers/catalog-app';
import { Customer, Fixture, fixture, readyOrders } from '../helpers/orders-app';

interface UserBody {
  id: string;
  role: string;
  phone: string | null;
  fullName: string | null;
}

describe('Teléfono y nombre del personal (CA-22)', () => {
  const harness = new CatalogHarness();
  beforeEach(() => harness.start());
  afterEach(() => harness.stop());

  const create = (body: object) => harness.send('post', '/users', body);
  const base = {
    username: 'repartidor_nuevo',
    password: 'Integration-only-password',
    role: 'repartidor',
  };
  const message = (response: { body: unknown }) =>
    (response.body as ErrorBody).message;
  const idOf = async (username: string) =>
    (
      await harness.context.source.query<{ id: string }[]>(
        `SELECT id FROM "${harness.context.ownedSchema}"."users" WHERE username = $1`,
        [username],
      )
    )[0].id;

  it('crear un repartidor exige teléfono y nombre; con ellos queda en E.164', async () => {
    await create(base).expect(400);
    await create({ ...base, phone: '300 123 4567' }).expect(400);
    await create({ ...base, fullName: 'Carlos Gómez' }).expect(400);
    await create({ ...base, phone: 'abc', fullName: 'Carlos Gómez' }).expect(
      400,
    );
    await create({ ...base, phone: '300 123 4567', fullName: 'C' }).expect(400);
    const created = await create({
      ...base,
      phone: '300 123 4567',
      fullName: '  Carlos Gómez  ',
    }).expect(201);
    expect(created.body).toMatchObject({
      role: 'repartidor',
      phone: '+573001234567',
      fullName: 'Carlos Gómez',
    });
  });

  it('el operador y el admin pueden tener contacto opcional; los demás roles no lo exigen', async () => {
    await create({ ...base, username: 'op_sin', role: 'operador' }).expect(201);
    const con = await create({
      ...base,
      username: 'op_con',
      role: 'operador',
      phone: '+573001234567',
      fullName: 'Olga Operadora',
    }).expect(201);
    expect(con.body).toMatchObject({ phone: '+573001234567' });
  });

  it('cambiar a repartidor exige que ya tenga los datos; PATCH los edita', async () => {
    const op = await create({
      ...base,
      username: 'op_cambio',
      role: 'operador',
    }).expect(201);
    const id = (op.body as UserBody).id;
    const refused = await harness
      .send('patch', `/users/${id}/role`, { role: 'repartidor' })
      .expect(400);
    expect(message(refused)).toContain('teléfono');
    const patched = await harness
      .send('patch', `/users/${id}`, {
        phone: '311 222 3344',
        fullName: 'Olga Operadora',
      })
      .expect(200);
    expect(patched.body).toMatchObject({ phone: '+573112223344' });
    await harness
      .send('patch', `/users/${id}/role`, { role: 'repartidor' })
      .expect(200);
    await harness.send('patch', `/users/${id}`, { phone: 'mal' }).expect(400);
    await harness.send('patch', `/users/${id}`, { fullName: 'x' }).expect(400);
  });

  it('un cliente no edita su contacto desde /users y GET /users devuelve el del personal', async () => {
    const ana: Customer = await harness.customer('ana');
    await harness
      .send('patch', `/users/${ana.id}`, { phone: '300 123 4567' })
      .expect(400);
    const listed = await harness.get('/users?limit=100', 'admin').expect(200);
    const courier = (
      listed.body as { data: (UserBody & { id: string })[] }
    ).data.find((u) => u.role === 'repartidor');
    expect(courier).toMatchObject({
      phone: '+573001234500',
      fullName: 'Carlos Repartidor',
    });
    const one = await harness.get(`/users/${courier!.id}`, 'admin').expect(200);
    expect(one.body).toMatchObject({ phone: '+573001234500' });
  });

  describe('eliminar usuarios con historial de despacho', () => {
    let ana: Customer;
    let f: Fixture;
    beforeEach(async () => {
      ana = await harness.customer('ana');
      f = await fixture(harness);
    });

    it('un repartidor con rondas y eventos de pedidos no se elimina (409)', async () => {
      const [order] = await readyOrders(harness, ana, f, [f.point]);
      await harness
        .send(
          'post',
          '/dispatch/rounds',
          { orderIds: [order.id] },
          'repartidor',
        )
        .expect(201);
      const response = await harness
        .send('delete', `/users/${await idOf('rol_repartidor')}`)
        .expect(409);
      expect(message(response)).toEqual(expect.any(String));
    });
  });
});
