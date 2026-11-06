import { OrderView } from '../orders/orders.view';
import { DispatchRound, RoundStatus } from './entities/dispatch-round.entity';

export interface ZoneQueueView {
  zoneId: string;
  zoneName: string;
  oldestNumber: number;
  orders: OrderView[];
}

export interface QueueView {
  suggestedZoneId: string | null;
  zones: ZoneQueueView[];
}

export interface RoundView {
  id: string;
  status: RoundStatus;
  zone: { id: string; name: string };
  courier: { id: string; fullName: string | null; phone: string | null };
  startedAt: Date;
  etaAt: Date;
  finishedAt: Date | null;
  orders: OrderView[];
}

export function roundView(
  round: DispatchRound,
  orders: OrderView[],
): RoundView {
  return {
    id: round.id,
    status: round.status,
    zone: { id: round.zoneId, name: round.zoneName },
    courier: {
      id: round.courierId,
      fullName: round.courier?.fullName ?? null,
      phone: round.courier?.phone ?? null,
    },
    startedAt: round.startedAt,
    etaAt: round.etaAt,
    finishedAt: round.finishedAt,
    orders: [...orders].sort((a, b) => a.number - b.number),
  };
}
