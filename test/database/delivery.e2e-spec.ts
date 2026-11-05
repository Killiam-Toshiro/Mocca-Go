import request from 'supertest';
import { UserRole } from '../../src/users/entities/user.entity';
import { CatalogHarness, ErrorBody } from '../helpers/catalog-app';

interface PointBody {
  id: string;
  zoneId: string;
  name: string;
  hint: string | null;
  floors: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
interface ZoneBody {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  points: PointBody[];
}

describe('Zonas y puntos de entrega: administración (CA-03 a CA-09, CA-13, CA-15)', () => {
  const harness = new CatalogHarness();
  beforeEach(() => harness.start());
  afterEach(() => harness.stop());

  const createZone = async (name = 'Zona 1') =>
    (await harness.send('post', '/delivery-zones', { name }).expect(201))
      .body as ZoneBody;
  const createPoint = async (zoneId: string, name = 'Edificio A', extra = {}) =>
    (
      await harness
        .send('post', '/delivery-points', { zoneId, name, ...extra })
        .expect(201)
    ).body as PointBody;
  const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('CA-03: crea zonas activas y rechaza repetidas, vacías y largas', async () => {
    const zone = await createZone();
    expect(zone).toMatchObject({ name: 'Zona 1', active: true, points: [] });
    for (const name of ['Zona 1', 'ZONA 1']) {
      const response = await harness
        .send('post', '/delivery-zones', { name })
        .expect(409);
      expect((response.body as ErrorBody).message).toBe(
        'Ya existe una zona con ese nombre.',
      );
    }
    for (const body of [
      { name: '' },
      { name: '   ' },
      { name: 'x'.repeat(61) },
      { name: 7 },
      {},
      { name: 'Zona 9', extra: 1 },
    ])
      await harness.send('post', '/delivery-zones', body).expect(400);
  });

  it('CA-04: edita zonas; repetir valores no cambia updatedAt', async () => {
    const zone = await createZone();
    await pause();
    const renamed = (
      await harness
        .send('patch', `/delivery-zones/${zone.id}`, { name: 'Norte' })
        .expect(200)
    ).body as ZoneBody;
    expect(renamed.name).toBe('Norte');
    expect(new Date(renamed.updatedAt).getTime()).toBeGreaterThan(
      new Date(zone.updatedAt).getTime(),
    );
    await pause();
    const same = (
      await harness
        .send('patch', `/delivery-zones/${zone.id}`, {
          name: 'Norte',
          active: true,
        })
        .expect(200)
    ).body as ZoneBody;
    expect(same.updatedAt).toBe(renamed.updatedAt);
    const off = (
      await harness
        .send('patch', `/delivery-zones/${zone.id}`, { active: false })
        .expect(200)
    ).body as ZoneBody;
    expect(off.active).toBe(false);
    await createZone('Sur');
    await harness
      .send('patch', `/delivery-zones/${zone.id}`, { name: 'sur' })
      .expect(409);
    for (const body of [{}, { name: null }, { active: null }, { extra: 1 }])
      await harness
        .send('patch', `/delivery-zones/${zone.id}`, body)
        .expect(400);
    await harness
      .send('patch', '/delivery-zones/00000000-0000-4000-8000-000000000000', {
        name: 'X',
      })
      .expect(404);
    await harness.send('patch', '/delivery-zones/no-es-uuid', {}).expect(400);
  });

  it('CA-05: elimina una zona solo si no tiene puntos', async () => {
    const zone = await createZone();
    const point = await createPoint(zone.id);
    const blocked = await harness
      .send('delete', `/delivery-zones/${zone.id}`)
      .expect(409);
    expect((blocked.body as ErrorBody).message).toMatch(/tiene puntos/);
    await harness.send('delete', `/delivery-points/${point.id}`).expect(204);
    await harness.send('delete', `/delivery-zones/${zone.id}`).expect(204);
    await harness.send('delete', `/delivery-zones/${zone.id}`).expect(404);
  });

  it('CA-06: crea puntos con y sin indicación y pisos', async () => {
    const zone = await createZone();
    const bare = await createPoint(zone.id, 'Canchas');
    expect(bare).toMatchObject({
      zoneId: zone.id,
      hint: null,
      floors: null,
      active: true,
    });
    const full = await createPoint(zone.id, 'Edificio M', {
      hint: 'Entrada principal',
      floors: 4,
    });
    expect(full).toMatchObject({ hint: 'Entrada principal', floors: 4 });
    const explicit = await createPoint(zone.id, 'Gym', {
      hint: null,
      floors: null,
    });
    expect(explicit).toMatchObject({ hint: null, floors: null });
    for (const extra of [
      { floors: 0 },
      { floors: 31 },
      { floors: 1.5 },
      { floors: '2' },
      { hint: '' },
      { hint: 5 },
      { name: '' },
    ])
      await harness
        .send('post', '/delivery-points', {
          zoneId: zone.id,
          name: 'Nuevo',
          ...extra,
        })
        .expect(400);
    await harness
      .send('post', '/delivery-points', {
        zoneId: '00000000-0000-4000-8000-000000000000',
        name: 'Nuevo',
      })
      .expect(404);
    await harness
      .send('post', '/delivery-points', { zoneId: zone.id, name: 'CANCHAS' })
      .expect(409);
  });

  it('CA-07: edita, mueve, activa y desactiva un punto', async () => {
    const one = await createZone('Zona 1');
    const two = await createZone('Zona 2');
    const point = await createPoint(one.id, 'Edificio A', {
      hint: 'Frente a la cafetería',
      floors: 2,
    });
    await pause();
    const edited = (
      await harness
        .send('patch', `/delivery-points/${point.id}`, {
          zoneId: two.id,
          name: 'Edificio B',
          hint: null,
          floors: null,
          active: false,
        })
        .expect(200)
    ).body as PointBody;
    expect(edited).toMatchObject({
      zoneId: two.id,
      name: 'Edificio B',
      hint: null,
      floors: null,
      active: false,
    });
    expect(new Date(edited.updatedAt).getTime()).toBeGreaterThan(
      new Date(point.updatedAt).getTime(),
    );
    await pause();
    const same = (
      await harness
        .send('patch', `/delivery-points/${point.id}`, {
          zoneId: two.id,
          name: 'Edificio B',
          hint: null,
          floors: null,
          active: false,
        })
        .expect(200)
    ).body as PointBody;
    expect(same.updatedAt).toBe(edited.updatedAt);
    await harness
      .send('patch', `/delivery-points/${point.id}`, { floors: 3, hint: 'x' })
      .expect(200);
    for (const body of [
      {},
      { name: null },
      { zoneId: null },
      { active: 'si' },
      { floors: 31 },
    ])
      await harness
        .send('patch', `/delivery-points/${point.id}`, body)
        .expect(400);
    await harness
      .send('patch', `/delivery-points/${point.id}`, {
        zoneId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(404);
    await createPoint(one.id, 'Otro');
    await harness
      .send('patch', `/delivery-points/${point.id}`, { name: 'otro' })
      .expect(409);
    await harness
      .send('patch', '/delivery-points/00000000-0000-4000-8000-000000000000', {
        name: 'X',
      })
      .expect(404);
  });

  it('CA-08: elimina un punto y luego responde 404', async () => {
    const zone = await createZone();
    const point = await createPoint(zone.id);
    await harness.send('delete', `/delivery-points/${point.id}`).expect(204);
    await harness.send('delete', `/delivery-points/${point.id}`).expect(404);
    await harness.send('delete', '/delivery-points/no-es-uuid').expect(400);
  });

  it('CA-09: solo el admin escribe; la autorización va antes de validar', async () => {
    const zone = await createZone();
    const point = await createPoint(zone.id);
    const routes: ['post' | 'patch' | 'delete', string, object][] = [
      ['post', '/delivery-zones', { name: 'X' }],
      ['patch', `/delivery-zones/${zone.id}`, { name: 'X' }],
      ['delete', `/delivery-zones/${zone.id}`, {}],
      ['post', '/delivery-points', { zoneId: zone.id, name: 'X' }],
      ['patch', `/delivery-points/${point.id}`, { name: 'X' }],
      ['delete', `/delivery-points/${point.id}`, {}],
    ];
    for (const role of ['operador', 'repartidor', 'cliente'] as UserRole[])
      for (const [method, path, body] of routes) {
        await harness.send(method, path, body, role).expect(403);
        // Un cuerpo inválido tampoco filtra información a quien no es admin.
        await harness.send(method, path, { extra: 1 }, role).expect(403);
      }
    for (const [method, path] of routes) {
      const agent = request(harness.server);
      await agent[method](`/api/v1${path}`).send({}).expect(401);
    }
    expect(
      (
        (await harness.get('/delivery-zones/all', 'admin').expect(200))
          .body as {
          data: ZoneBody[];
        }
      ).data[0].points,
    ).toHaveLength(1);
  });

  it('CA-13: /all incluye inactivos y zonas vacías, solo para admin', async () => {
    const one = await createZone('Zona 1');
    await createZone('Zona 2');
    const point = await createPoint(one.id, 'Edificio A', { floors: 2 });
    await harness
      .send('patch', `/delivery-points/${point.id}`, { active: false })
      .expect(200);
    await harness
      .send('patch', `/delivery-zones/${one.id}`, { active: false })
      .expect(200);
    const body = (await harness.get('/delivery-zones/all', 'admin').expect(200))
      .body as { data: ZoneBody[] };
    expect(body.data.map((zone) => zone.name)).toEqual(['Zona 1', 'Zona 2']);
    expect(body.data[0]).toMatchObject({ active: false });
    expect(body.data[0].points[0]).toMatchObject({
      name: 'Edificio A',
      active: false,
      zoneId: one.id,
    });
    expect(body.data[1].points).toEqual([]);
    for (const role of ['operador', 'repartidor', 'cliente'] as UserRole[])
      await harness.get('/delivery-zones/all', role).expect(403);
    await harness.get('/delivery-zones/all').expect(401);
  });

  it('CA-15: crear un punto y eliminar su zona a la vez no deja huérfanos ni 500', async () => {
    for (let round = 0; round < 8; round++) {
      const zone = await createZone(`Carrera ${round}`);
      const [created, removed] = await Promise.all([
        harness.send('post', '/delivery-points', {
          zoneId: zone.id,
          name: `Punto ${round}`,
        }),
        harness.send('delete', `/delivery-zones/${zone.id}`),
      ]);
      expect([201, 404]).toContain(created.status);
      expect([204, 409]).toContain(removed.status);
      // Exactamente una de las dos gana.
      expect(created.status === 201).toBe(removed.status === 409);
    }
    const orphans = await harness.context.source.query<unknown[]>(
      `SELECT 1 FROM "${harness.context.ownedSchema}"."delivery_points" p
       LEFT JOIN "${harness.context.ownedSchema}"."delivery_zones" z ON z.id = p.zone_id
       WHERE z.id IS NULL`,
    );
    expect(orphans).toEqual([]);
  });
});
