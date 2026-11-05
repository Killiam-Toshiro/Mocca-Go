import request from 'supertest';
import { CatalogHarness } from '../helpers/catalog-app';

interface PublicZone {
  id: string;
  name: string;
  points: {
    id: string;
    name: string;
    hint: string | null;
    floors: number | null;
  }[];
}

describe('Zonas y puntos de entrega: consulta pública (CA-10 a CA-12, CA-14)', () => {
  const harness = new CatalogHarness();
  beforeEach(() => harness.start());
  afterEach(() => harness.stop());

  const publicZones = async () => {
    const response = await request(harness.server)
      .get('/api/v1/delivery-zones')
      .expect(200);
    return {
      headers: response.headers,
      data: (response.body as { data: PublicZone[] }).data,
    };
  };
  const zone = async (name: string) =>
    (
      (await harness.send('post', '/delivery-zones', { name }).expect(201))
        .body as { id: string }
    ).id;
  const point = async (zoneId: string, name: string, extra = {}) =>
    (
      (
        await harness
          .send('post', '/delivery-points', { zoneId, name, ...extra })
          .expect(201)
      ).body as { id: string }
    ).id;

  it('CA-10 y CA-11: público, no-store, ordenado y sin datos internos', async () => {
    const two = await zone('Zona 2');
    const one = await zone('Zona 1');
    await zone('Zona vacía');
    await point(two, 'Edificio C', { floors: 3 });
    await point(one, 'Edificio M', { floors: 4 });
    await point(one, 'Auditorios', { floors: 1, hint: 'Plazoleta' });
    await point(one, 'canchas');
    const { headers, data } = await publicZones();
    expect(headers['cache-control']).toBe('no-store');
    expect(data.map((item) => item.name)).toEqual(['Zona 1', 'Zona 2']);
    expect(data[0].points.map((item) => item.name)).toEqual([
      'Auditorios',
      'canchas',
      'Edificio M',
    ]);
    expect(Object.keys(data[0]).sort()).toEqual(['id', 'name', 'points']);
    expect(Object.keys(data[0].points[0]).sort()).toEqual([
      'floors',
      'hint',
      'id',
      'name',
    ]);
    expect(data[0].points[0]).toMatchObject({ hint: 'Plazoleta', floors: 1 });
    expect(data[0].points[1]).toMatchObject({ hint: null, floors: null });
  });

  it('CA-12: desactivar un punto o una zona los oculta de inmediato, pero siguen en /all', async () => {
    const one = await zone('Zona 1');
    const two = await zone('Zona 2');
    const a = await point(one, 'Edificio A');
    await point(one, 'Edificio B');
    await point(two, 'Edificio C');
    await harness.send('patch', `/delivery-points/${a}`, { active: false });
    expect((await publicZones()).data[0].points.map((p) => p.name)).toEqual([
      'Edificio B',
    ]);
    await harness.send('patch', `/delivery-zones/${two}`, { active: false });
    expect((await publicZones()).data.map((item) => item.name)).toEqual([
      'Zona 1',
    ]);
    await harness.send('patch', `/delivery-points/${a}`, { active: true });
    expect((await publicZones()).data[0].points).toHaveLength(2);
    const all = (await harness.get('/delivery-zones/all', 'admin').expect(200))
      .body as { data: { points: unknown[] }[] };
    expect(all.data.map((item) => item.points.length)).toEqual([2, 1]);
  });

  it('CA-14: limita las peticiones por IP (429 tras 60 por minuto)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 62; i++)
      statuses.push(
        (await request(harness.server).get('/api/v1/delivery-zones')).status,
      );
    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
  });
});
