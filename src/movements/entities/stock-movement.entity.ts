import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../../products/entities/products.entity';
import { User } from '../../users/entities/user.entity';

export type MovementType = 'IN' | 'OUT';
export const MOVEMENT_TYPES: readonly MovementType[] = ['IN', 'OUT'];

@Entity('stock_movements')
@Check('movements_type_valid', `"type" IN ('IN', 'OUT')`)
@Check('movements_quantity_positive', `"quantity" > 0`)
@Check('movements_reason_nonempty', `length(trim("reason")) > 0`)
@Index('movements_product_created_idx', ['productId', 'createdAt'])
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 3 })
  type!: MovementType;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ type: 'varchar', length: 300 })
  reason!: string;

  @Column({
    name: 'seed_key',
    type: 'varchar',
    length: 80,
    unique: true,
    nullable: true,
  })
  seedKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
