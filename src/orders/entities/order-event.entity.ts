import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order, OrderStatus } from './order.entity';

@Entity('order_events')
export class OrderEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.events, { nullable: false })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  @Column({ type: 'varchar', length: 16 })
  status!: OrderStatus;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
