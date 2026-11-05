import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { OrderEvent } from './order-event.entity';
import { OrderItem } from './order-item.entity';

export type OrderStatus =
  | 'recibido'
  | 'en_preparacion'
  | 'listo'
  | 'en_camino'
  | 'entregado'
  | 'cancelado';
export const ORDER_STATUSES: readonly OrderStatus[] = [
  'recibido',
  'en_preparacion',
  'listo',
  'en_camino',
  'entregado',
  'cancelado',
];
export type PaymentStatus = 'aprobado' | 'reembolsado';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Lo genera PostgreSQL (identidad desde 1001): nunca se escribe desde aquí.
  @Column({ type: 'integer', insert: false, update: false })
  number!: number;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @Column({ type: 'varchar', length: 16, default: 'recibido' })
  status!: OrderStatus;

  @Column({ name: 'point_id', type: 'uuid' })
  pointId!: string;

  @Column({ name: 'point_name', type: 'varchar', length: 80 })
  pointName!: string;

  @Column({ name: 'zone_name', type: 'varchar', length: 60 })
  zoneName!: string;

  @Column({ type: 'smallint', nullable: true })
  floor!: number | null;

  @Column({
    name: 'delivery_note',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  deliveryNote!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note!: string | null;

  @Column({ type: 'integer' })
  total!: number;

  @Column({ name: 'payment_method', type: 'varchar', length: 16 })
  paymentMethod!: string;

  @Column({ name: 'payment_last4', type: 'char', length: 4 })
  paymentLast4!: string;

  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 12,
    default: 'aprobado',
  })
  paymentStatus!: PaymentStatus;

  @Column({ name: 'idempotency_key', type: 'uuid' })
  idempotencyKey!: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;

  @Column({
    name: 'cancel_reason',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  cancelReason!: string | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items?: OrderItem[];

  @OneToMany(() => OrderEvent, (event) => event.order)
  events?: OrderEvent[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
