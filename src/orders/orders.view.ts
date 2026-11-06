import { whatsappUrl } from '../dispatch/dispatch.calc';
import { Order, OrderStatus, PaymentStatus } from './entities/order.entity';

export interface OrderItemView {
  productId: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  components: {
    productId: string;
    sku: string;
    name: string;
    quantity: number;
  }[];
}

export interface OrderView {
  id: string;
  number: number;
  status: OrderStatus;
  total: number;
  items: OrderItemView[];
  delivery: {
    pointId: string;
    pointName: string;
    zoneName: string;
    floor: number | null;
    deliveryNote: string | null;
    /** Hora estimada de llegada; solo mientras el pedido está `en_camino`. */
    etaAt: Date | null;
    /** Repartidor; solo mientras el pedido está `en_camino`. */
    courier: { fullName: string; phone: string; whatsappUrl: string } | null;
  };
  note: string | null;
  payment: { method: string; last4: string; status: PaymentStatus };
  customer: { name: string; phone: string };
  cancelReason: string | null;
  failureReason: string | null;
  /** Respuesta de la encuesta; `null` mientras el cliente no la envíe. */
  survey: { rating: number; comment: string | null; createdAt: Date } | null;
  events: { status: OrderStatus; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

/** Relaciones que se cargan para armar la vista de un pedido. */
export const ORDER_RELATIONS = {
  customer: true,
  items: { components: true },
  events: true,
  round: { courier: true },
  survey: true,
} as const;

const bySku = (a: { sku: string }, b: { sku: string }) =>
  a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;

/**
 * Vista de un pedido. El costo de las líneas es interno y no se devuelve
 * (D-98); la tarjeta se reduce a sus últimos cuatro dígitos.
 */
export function orderView(order: Order): OrderView {
  // El repartidor y la hora estimada son del cliente solo mientras va en camino (RN-92).
  const courier =
    order.status === 'en_camino' &&
    order.round?.courier?.phone &&
    order.round.courier.fullName
      ? order.round.courier
      : null;
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    total: order.total,
    items: [...(order.items ?? [])].sort(bySku).map((item) => ({
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      components: [...(item.components ?? [])].sort(bySku).map((part) => ({
        productId: part.productId,
        sku: part.sku,
        name: part.name,
        quantity: part.quantity,
      })),
    })),
    delivery: {
      pointId: order.pointId,
      pointName: order.pointName,
      zoneName: order.zoneName,
      floor: order.floor,
      deliveryNote: order.deliveryNote,
      etaAt: courier && order.round ? order.round.etaAt : null,
      courier:
        courier && courier.phone && courier.fullName
          ? {
              fullName: courier.fullName,
              phone: courier.phone,
              whatsappUrl: whatsappUrl(courier.phone),
            }
          : null,
    },
    note: order.note,
    payment: {
      method: order.paymentMethod,
      last4: order.paymentLast4,
      status: order.paymentStatus,
    },
    customer: {
      name: order.customer?.fullName ?? '',
      phone: order.customer?.phone ?? '',
    },
    cancelReason: order.cancelReason,
    failureReason: order.failureReason,
    survey: order.survey
      ? {
          rating: order.survey.rating,
          comment: order.survey.comment,
          createdAt: order.survey.createdAt,
        }
      : null,
    events: [...(order.events ?? [])]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((event) => ({ status: event.status, at: event.createdAt })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
