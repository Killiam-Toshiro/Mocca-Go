import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  isConstraintViolation,
  POINT_NAME_KEY,
  POINT_ZONE_FK,
  ZONE_NAME_KEY,
} from '../common/database-errors';
import {
  CreatePointDto,
  CreateZoneDto,
  UpdatePointDto,
  UpdateZoneDto,
} from './delivery.dto';
import {
  AdminPointView,
  AdminZoneView,
  adminPointView,
  adminZoneView,
  compareByName,
  JoinedPoint,
  PublicZoneView,
  publicZones,
} from './delivery.views';
import { DeliveryPoint } from './entities/delivery-point.entity';
import { DeliveryZone } from './entities/delivery-zone.entity';

const ZONE_NOT_FOUND = 'Zona no encontrada.';
const POINT_NOT_FOUND = 'Punto no encontrado.';
const ZONE_NAME_TAKEN = 'Ya existe una zona con ese nombre.';
const POINT_NAME_TAKEN = 'Ya existe un punto con ese nombre.';
const ZONE_HAS_POINTS = 'La zona tiene puntos; muévelos o elimínalos antes.';

@Injectable()
export class DeliveryService {
  constructor(private readonly source: DataSource) {}

  /** Zonas y puntos activos para el cliente (RN-45). */
  async publicZones(): Promise<{ data: PublicZoneView[] }> {
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const points = await manager
        .getRepository(DeliveryPoint)
        .createQueryBuilder('point')
        .innerJoinAndMapOne(
          'point.zone',
          DeliveryZone,
          'zone',
          'zone.id = point.zoneId',
        )
        .where('point.active = true AND zone.active = true')
        .getMany();
      return { data: publicZones(points as JoinedPoint[]) };
    });
  }

  /** Todo el catálogo para el admin (RN-46). */
  async allZones(): Promise<{ data: AdminZoneView[] }> {
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const zones = await manager.getRepository(DeliveryZone).find();
      const points = await manager.getRepository(DeliveryPoint).find();
      return {
        data: [...zones]
          .sort(compareByName)
          .map((zone) =>
            adminZoneView(
              zone,
              points
                .filter((point) => point.zoneId === zone.id)
                .sort(compareByName),
            ),
          ),
      };
    });
  }

  async createZone(input: CreateZoneDto): Promise<AdminZoneView> {
    try {
      const repo = this.source.getRepository(DeliveryZone);
      const zone = await repo.save(repo.create({ name: input.name }));
      return adminZoneView(zone, []);
    } catch (error) {
      if (isConstraintViolation(error, '23505', ZONE_NAME_KEY))
        throw new ConflictException(ZONE_NAME_TAKEN);
      throw error;
    }
  }

  async updateZone(id: string, input: UpdateZoneDto): Promise<AdminZoneView> {
    if (input.name === undefined && input.active === undefined)
      throw new BadRequestException('Indica al menos un campo para editar.');
    try {
      return await this.source.transaction(async (manager) => {
        const zone = await manager
          .getRepository(DeliveryZone)
          .createQueryBuilder('zone')
          .where('zone.id = :id', { id })
          .setLock('pessimistic_write')
          .getOne();
        if (!zone) throw new NotFoundException(ZONE_NOT_FOUND);
        const changes: Partial<Pick<DeliveryZone, 'name' | 'active'>> = {};
        if (input.name !== undefined && input.name !== zone.name)
          changes.name = input.name;
        if (input.active !== undefined && input.active !== zone.active)
          changes.active = input.active;
        if (Object.keys(changes).length > 0)
          await manager.getRepository(DeliveryZone).update(id, changes);
        return this.zoneView(manager, id);
      });
    } catch (error) {
      if (isConstraintViolation(error, '23505', ZONE_NAME_KEY))
        throw new ConflictException(ZONE_NAME_TAKEN);
      throw error;
    }
  }

  /** La FK RESTRICT cierra la carrera con un punto recién creado. */
  async removeZone(id: string): Promise<void> {
    try {
      const result = await this.source
        .getRepository(DeliveryZone)
        .delete({ id });
      if (!result.affected) throw new NotFoundException(ZONE_NOT_FOUND);
    } catch (error) {
      if (isConstraintViolation(error, '23503', POINT_ZONE_FK))
        throw new ConflictException(ZONE_HAS_POINTS);
      throw error;
    }
  }

  async createPoint(input: CreatePointDto): Promise<AdminPointView> {
    try {
      return await this.source.transaction(async (manager) => {
        await this.lockZone(manager, input.zoneId);
        const repo = manager.getRepository(DeliveryPoint);
        const point = await repo.save(
          repo.create({
            zoneId: input.zoneId,
            name: input.name,
            hint: input.hint ?? null,
            floors: input.floors ?? null,
          }),
        );
        return adminPointView(point);
      });
    } catch (error) {
      throw this.mapPointError(error);
    }
  }

  async updatePoint(
    id: string,
    input: UpdatePointDto,
  ): Promise<AdminPointView> {
    if (
      input.zoneId === undefined &&
      input.name === undefined &&
      input.hint === undefined &&
      input.floors === undefined &&
      input.active === undefined
    )
      throw new BadRequestException('Indica al menos un campo para editar.');
    try {
      return await this.source.transaction(async (manager) => {
        const repo = manager.getRepository(DeliveryPoint);
        const point = await repo
          .createQueryBuilder('point')
          .where('point.id = :id', { id })
          .setLock('pessimistic_write')
          .getOne();
        if (!point) throw new NotFoundException(POINT_NOT_FOUND);
        const changes: Partial<
          Pick<DeliveryPoint, 'zoneId' | 'name' | 'hint' | 'floors' | 'active'>
        > = {};
        if (input.zoneId !== undefined && input.zoneId !== point.zoneId) {
          await this.lockZone(manager, input.zoneId);
          changes.zoneId = input.zoneId;
        }
        if (input.name !== undefined && input.name !== point.name)
          changes.name = input.name;
        if (input.hint !== undefined && input.hint !== point.hint)
          changes.hint = input.hint;
        if (input.floors !== undefined && input.floors !== point.floors)
          changes.floors = input.floors;
        if (input.active !== undefined && input.active !== point.active)
          changes.active = input.active;
        if (Object.keys(changes).length > 0) await repo.update(id, changes);
        return adminPointView(await repo.findOneByOrFail({ id }));
      });
    } catch (error) {
      throw this.mapPointError(error);
    }
  }

  async removePoint(id: string): Promise<void> {
    const result = await this.source
      .getRepository(DeliveryPoint)
      .delete({ id });
    if (!result.affected) throw new NotFoundException(POINT_NOT_FOUND);
  }

  /** Bloqueo compartido: una baja de la zona espera o falla por la FK. */
  private async lockZone(manager: EntityManager, id: string): Promise<void> {
    const zone = await manager
      .getRepository(DeliveryZone)
      .createQueryBuilder('zone')
      .where('zone.id = :id', { id })
      .setLock('pessimistic_read')
      .getOne();
    if (!zone) throw new NotFoundException(ZONE_NOT_FOUND);
  }

  private async zoneView(
    manager: EntityManager,
    id: string,
  ): Promise<AdminZoneView> {
    const zone = await manager
      .getRepository(DeliveryZone)
      .findOneByOrFail({ id });
    const points = await manager
      .getRepository(DeliveryPoint)
      .find({ where: { zoneId: id } });
    return adminZoneView(zone, points.sort(compareByName));
  }

  private mapPointError(error: unknown): unknown {
    if (isConstraintViolation(error, '23505', POINT_NAME_KEY))
      return new ConflictException(POINT_NAME_TAKEN);
    // La zona desapareció entre el bloqueo y la escritura.
    if (isConstraintViolation(error, '23503', POINT_ZONE_FK))
      return new NotFoundException(ZONE_NOT_FOUND);
    return error;
  }
}
