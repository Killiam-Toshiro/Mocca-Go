import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type RoundStatus = 'activa' | 'finalizada';
export const ROUND_STATUSES: readonly RoundStatus[] = ['activa', 'finalizada'];

@Entity('dispatch_rounds')
export class DispatchRound {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'courier_id', type: 'uuid' })
  courierId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'courier_id' })
  courier?: User;

  @Column({ name: 'zone_id', type: 'uuid' })
  zoneId!: string;

  @Column({ name: 'zone_name', type: 'varchar', length: 60 })
  zoneName!: string;

  @Column({ type: 'varchar', length: 10, default: 'activa' })
  status!: RoundStatus;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'eta_at', type: 'timestamptz' })
  etaAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
