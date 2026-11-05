import { StockMovement, MovementType } from './entities/stock-movement.entity';

export interface MovementView {
  id: string;
  productId: string;
  type: MovementType;
  quantity: number;
  reason: string;
  user: { id: string; username: string };
  createdAt: Date;
}

export function movementView(movement: StockMovement): MovementView {
  return {
    id: movement.id,
    productId: movement.productId,
    type: movement.type,
    quantity: movement.quantity,
    reason: movement.reason,
    user: { id: movement.user.id, username: movement.user.username },
    createdAt: movement.createdAt,
  };
}
