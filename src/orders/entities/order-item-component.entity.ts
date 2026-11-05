import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

@Entity('order_item_components')
export class OrderItemComponent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @ManyToOne(() => OrderItem, (item) => item.components, { nullable: false })
  @JoinColumn({ name: 'item_id' })
  item?: OrderItem;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ type: 'varchar', length: 48 })
  sku!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'integer' })
  quantity!: number;
}
