import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'admin' | 'operador';
export const USER_ROLES: readonly UserRole[] = ['admin', 'operador'];

@Entity('users')
@Check('users_username_format', `"username" ~ '^[a-z0-9][a-z0-9._-]{2,63}$'`)
@Check('users_role_valid', `"role" IN ('admin', 'operador')`)
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  username!: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 16, default: 'operador' })
  role!: UserRole;

  @Column({
    name: 'login_failures',
    type: 'integer',
    default: 0,
    select: false,
  })
  loginFailures!: number;

  @Column({
    name: 'blocked_until',
    type: 'timestamptz',
    nullable: true,
    select: false,
  })
  blockedUntil!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
