import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Identity } from '../auth/auth.service';
import { Customer } from '../customers/entities/customer.entity';
import {
  isConstraintViolation,
  MOVEMENT_USER_FK,
  ORDER_COMPONENT_PRODUCT_FK,
  ORDER_CUSTOMER_FK,
  ORDER_EVENT_USER_FK,
  ORDER_IDEMPOTENCY_KEY,
  ORDER_ITEM_PRODUCT_FK,
  ORDER_POINT_FK,
} from '../common/database-errors';
import { buildPage, Page, pageParams } from '../common/pagination';
import { DeliveryPoint } from '../delivery/entities/delivery-point.entity';
import { DeliveryZone } from '../delivery/entities/delivery-zone.entity';
import { StockMovement } from '../movements/entities/stock-movement.entity';
import { MovementsService } from '../movements/movements.service';
import { comboCost, ComponentState, isAvailable } from '../products/catalog';
import { ProductComponent } from '../products/entities/product-component.entity';
import { Product } from '../products/entities/products.entity';
import { CreateOrderDto, ListOrdersDto } from './orders.dto';
import {
  Need,
  cardResult,
  expandNeeds,
  hasDuplicates,
  MAX_ORDER_TOTAL,
  orderTotal,
  requestHash,
} from './orders.calc';
import { OrderEvent } from './entities/order-event.entity';
import { OrderItemComponent } from './entities/order-item-component.entity';
import { OrderItem } from './entities/order-item.entity';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderView, orderView } from './orders.view';

const RELATIONS = {
  customer: true,
  items: { components: true },
  events: true,
} as const;

const CLIENT_CANCELABLE: readonly OrderStatus[] = ['recibido'];
const STAFF_CANCELABLE: readonly OrderStatus[] = ['recibido', 'en_preparacion'];

interface PricedLine {
  product: Product;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  parts: (Need & { sku: string; name: string; perUnit: number })[];
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly source: DataSource,
    private readonly movements: MovementsService,
  ) {}

  async create(
    actor: Identity,
    key: string,
    input: CreateOrderDto,
  ): Promise<{ order: OrderView; created: boolean }> {
    const ids = input.items.map((item) => item.productId);
    if (hasDuplicates(ids))
      throw new BadRequestException('Un producto no puede repetirse.');
    const card = cardResult(input.payment.cardNumber);
    if (card === 'unknown')
      throw new BadRequestException('Tarjeta de prueba no reconocida.');
    const hash = requestHash({
      items: input.items,
      pointId: input.pointId,
      floor: input.floor,
      deliveryNote: input.deliveryNote,
      note: input.note,
      paymentMethod: input.payment.method,
    });
    try {
      return await this.source.transaction(async (manager) => {
        // Serializa las peticiones con la misma clave: la segunda ve el pedido ya creado.
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `order:${actor.id}:${key}`,
        ]);
        const previous = await manager
          .getRepository(Order)
          .findOneBy({ customerId: actor.id, idempotencyKey: key });
        if (previous) return this.replay(manager, previous, hash);

        const customer = await manager
          .getRepository(Customer)
          .findOneBy({ userId: actor.id });
        if (!customer) throw new ForbiddenException('Permisos insuficientes.');
        const lines = await this.priceLines(manager, input);
        const point = await this.deliveryPoint(manager, input);
        const total = orderTotal(lines);
        if (total > MAX_ORDER_TOTAL)
          throw new BadRequestException(
            'El total del pedido no puede superar 200.000 COP.',
          );
        for (const line of lines)
          if (!line.product.active)
            throw new ConflictException(
              `El producto «${line.product.name}» no está disponible.`,
            );
        if (!point.point.active || !point.zone.active)
          throw new ConflictException(
            'El punto de entrega no está disponible.',
          );
        const needs = expandNeeds(
          lines.map((line) => ({ quantity: line.quantity, parts: line.parts })),
        );
        const locked = await this.lockAndCheck(manager, needs);
        // Último paso antes de cobrar: un rechazo no deja ningún rastro.
        if (card === 'declined')
          throw new HttpException(
            {
              statusCode: 402,
              message: 'Pago rechazado.',
              error: 'Payment Required',
            },
            402,
          );
        const orders = manager.getRepository(Order);
        const saved = await orders.save(
          orders.create({
            customerId: actor.id,
            status: 'recibido',
            pointId: point.point.id,
            pointName: point.point.name,
            zoneName: point.zone.name,
            floor: input.floor ?? null,
            deliveryNote: input.deliveryNote ?? null,
            note: input.note ?? null,
            total,
            paymentMethod: input.payment.method,
            paymentLast4: input.payment.cardNumber.slice(-4),
            paymentStatus: 'aprobado',
            idempotencyKey: key,
            requestHash: hash,
          }),
        );
        const { number } = await orders.findOneByOrFail({ id: saved.id });
        await this.saveItems(manager, saved.id, lines);
        await manager
          .getRepository(OrderEvent)
          .insert({ orderId: saved.id, status: 'recibido', userId: actor.id });
        for (const need of needs)
          await this.movements.applyLocked(
            manager,
            locked.get(need.productId)!,
            {
              productId: need.productId,
              userId: actor.id,
              type: 'OUT',
              quantity: need.quantity,
              reason: `Pedido #${number}`,
              orderId: saved.id,
            },
          );
        return { order: await this.load(manager, saved.id), created: true };
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async list(actor: Identity, input: ListOrdersDto): Promise<Page<OrderView>> {
    const params = pageParams(input);
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const [orders, total] = await manager.getRepository(Order).findAndCount({
        relations: RELATIONS,
        where: {
          ...(actor.role === 'cliente' ? { customerId: actor.id } : {}),
          ...(input.status === undefined ? {} : { status: input.status }),
        },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      });
      return buildPage(orders.map(orderView), params, total);
    });
  }

  async findOne(actor: Identity, id: string): Promise<OrderView> {
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const order = await manager.getRepository(Order).findOne({
        relations: RELATIONS,
        where: {
          id,
          ...(actor.role === 'cliente' ? { customerId: actor.id } : {}),
        },
      });
      if (!order) throw new NotFoundException('Pedido no encontrado.');
      return orderView(order);
    });
  }

  async cancel(
    actor: Identity,
    id: string,
    reason: string | undefined,
  ): Promise<OrderView> {
    const isClient = actor.role === 'cliente';
    if (!isClient && reason === undefined)
      throw new BadRequestException('Indica el motivo de la cancelación.');
    try {
      return await this.source.transaction(async (manager) => {
        const orders = manager.getRepository(Order);
        const order = await orders
          .createQueryBuilder('order')
          .where('order.id = :id', { id })
          .setLock('pessimistic_write')
          .getOne();
        if (!order || (isClient && order.customerId !== actor.id))
          throw new NotFoundException('Pedido no encontrado.');
        const allowed = isClient ? CLIENT_CANCELABLE : STAFF_CANCELABLE;
        if (!allowed.includes(order.status))
          throw new ConflictException(
            `El pedido no se puede cancelar en estado «${order.status}».`,
          );
        const outs = await manager
          .getRepository(StockMovement)
          .find({ where: { orderId: id, type: 'OUT' } });
        const returns = expandNeeds([
          {
            quantity: 1,
            parts: outs.map((out) => ({
              productId: out.productId,
              quantity: out.quantity,
            })),
          },
        ]);
        for (const item of returns)
          await this.movements.applyMovement(
            manager,
            {
              productId: item.productId,
              userId: actor.id,
              type: 'IN',
              quantity: item.quantity,
              reason: `Cancelación del pedido #${order.number}`,
              orderId: id,
            },
            { allowInactive: true },
          );
        await orders.update(id, {
          status: 'cancelado',
          paymentStatus: 'reembolsado',
          cancelReason: reason ?? null,
          cancelledBy: actor.id,
        });
        await manager
          .getRepository(OrderEvent)
          .insert({ orderId: id, status: 'cancelado', userId: actor.id });
        return this.load(manager, id);
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private async load(manager: EntityManager, id: string): Promise<OrderView> {
    const order = await manager
      .getRepository(Order)
      .findOneOrFail({ relations: RELATIONS, where: { id } });
    return orderView(order);
  }

  private async replay(
    manager: EntityManager,
    previous: Order,
    hash: string,
  ): Promise<{ order: OrderView; created: boolean }> {
    if (previous.requestHash !== hash)
      throw new ConflictException(
        'La clave de idempotencia ya se usó con otro contenido.',
      );
    return { order: await this.load(manager, previous.id), created: false };
  }

  /** Carga los productos, valida disponibilidad y calcula precio y costo de cada línea. */
  private async priceLines(
    manager: EntityManager,
    input: CreateOrderDto,
  ): Promise<PricedLine[]> {
    const products = await manager
      .getRepository(Product)
      .findBy({ id: In(input.items.map((item) => item.productId)) });
    const byId = new Map(products.map((product) => [product.id, product]));
    const combos = products.filter((product) => product.category === 'combo');
    const links = combos.length
      ? await manager
          .getRepository(ProductComponent)
          .createQueryBuilder('link')
          .innerJoinAndSelect('link.component', 'component')
          .where('link.comboId IN (:...ids)', {
            ids: combos.map((combo) => combo.id),
          })
          .orderBy('component.sku', 'ASC')
          .getMany()
      : [];
    return input.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new NotFoundException('Producto no encontrado.');
      const parts = links
        .filter((link) => link.comboId === product.id)
        .map((link) => ({ link, part: link.component as Product }));
      const states: ComponentState[] = parts.map(({ link, part }) => ({
        quantity: link.quantity,
        cost: part.cost,
        stock: part.stock,
        active: part.active,
        soldOut: part.soldOut,
      }));
      const isCombo = product.category === 'combo';
      if (
        !isAvailable({
          active: product.active,
          soldOut: product.soldOut,
          price: product.price,
          stock: product.stock,
          components: isCombo ? states : undefined,
        })
      )
        throw new ConflictException(
          `El producto «${product.name}» no está disponible.`,
        );
      return {
        product,
        quantity: item.quantity,
        unitPrice: product.price,
        unitCost: isCombo ? comboCost(states) : product.cost,
        parts: isCombo
          ? parts.map(({ link, part }) => ({
              productId: part.id,
              quantity: link.quantity,
              perUnit: link.quantity,
              sku: part.sku,
              name: part.name,
            }))
          : [
              {
                productId: product.id,
                quantity: 1,
                perUnit: 1,
                sku: product.sku,
                name: product.name,
              },
            ],
      };
    });
  }

  private async deliveryPoint(
    manager: EntityManager,
    input: CreateOrderDto,
  ): Promise<{ point: DeliveryPoint; zone: DeliveryZone }> {
    const point = await manager
      .getRepository(DeliveryPoint)
      .findOneBy({ id: input.pointId });
    if (!point) throw new NotFoundException('Punto de entrega no encontrado.');
    if (point.floors === null && input.floor !== undefined)
      throw new BadRequestException(
        'Este punto no tiene pisos: no envíes `floor`.',
      );
    if (point.floors !== null) {
      if (input.floor === undefined)
        throw new BadRequestException('Indica el piso (`floor`).');
      if (input.floor > point.floors)
        throw new BadRequestException(
          `El punto solo tiene ${point.floors} piso(s).`,
        );
    }
    const zone = await manager
      .getRepository(DeliveryZone)
      .findOneByOrFail({ id: point.zoneId });
    return { point, zone };
  }

  /** Bloquea en orden de id y comprueba el saldo con el nombre del producto. */
  private async lockAndCheck(
    manager: EntityManager,
    needs: readonly Need[],
  ): Promise<Map<string, Product>> {
    const locked = new Map<string, Product>();
    for (const need of needs) {
      const product = await this.movements.lockProduct(manager, need.productId);
      if (!product)
        throw new ConflictException('Un producto ya no está disponible.');
      if (!product.active || product.soldOut)
        throw new ConflictException(
          `El producto «${product.name}» no está disponible.`,
        );
      if (product.stock < need.quantity)
        throw new ConflictException(`Saldo insuficiente de «${product.name}».`);
      locked.set(product.id, product);
    }
    return locked;
  }

  private async saveItems(
    manager: EntityManager,
    orderId: string,
    lines: readonly PricedLine[],
  ): Promise<void> {
    for (const line of lines) {
      const item = await manager.getRepository(OrderItem).save({
        orderId,
        productId: line.product.id,
        sku: line.product.sku,
        name: line.product.name,
        category: line.product.category,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
        lineTotal: line.unitPrice * line.quantity,
      });
      if (line.product.category === 'combo')
        await manager.getRepository(OrderItemComponent).insert(
          line.parts.map((part) => ({
            itemId: item.id,
            productId: part.productId,
            sku: part.sku,
            name: part.name,
            quantity: part.perUnit,
          })),
        );
    }
  }

  private mapError(error: unknown): unknown {
    if (isConstraintViolation(error, '23505', ORDER_IDEMPOTENCY_KEY))
      return new ConflictException(
        'Ya existe un pedido con esa clave de idempotencia.',
      );
    for (const constraint of [
      ORDER_CUSTOMER_FK,
      ORDER_EVENT_USER_FK,
      MOVEMENT_USER_FK,
    ])
      if (isConstraintViolation(error, '23503', constraint))
        return new UnauthorizedException('Credenciales inválidas.');
    if (isConstraintViolation(error, '23503', ORDER_POINT_FK))
      return new ConflictException(
        'El punto de entrega ya no está disponible.',
      );
    for (const constraint of [
      ORDER_ITEM_PRODUCT_FK,
      ORDER_COMPONENT_PRODUCT_FK,
    ])
      if (isConstraintViolation(error, '23503', constraint))
        return new ConflictException('Un producto ya no está disponible.');
    return error;
  }
}
