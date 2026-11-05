import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('delivery_points')
export class DeliveryPoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'zone_id', type: 'uuid' })
  zoneId!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  hint!: string | null;

  @Column({ type: 'smallint', nullable: true })
  floors!: number | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
