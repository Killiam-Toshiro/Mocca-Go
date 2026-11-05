import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('customers')
@Unique('customers_email_key', ['email'])
@Check('customers_email_lower', `"email" = lower("email")`)
@Check('customers_email_format', `"email" ~ '^[^@[:space:]]+@[^@[:space:]]+$'`)
@Check('customers_full_name_valid', `char_length(btrim("full_name")) >= 2`)
@Check('customers_phone_e164', `"phone" ~ '^\\+[1-9][0-9]{7,14}$'`)
export class Customer {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName!: string;

  @Column({ type: 'varchar', length: 16 })
  phone!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
