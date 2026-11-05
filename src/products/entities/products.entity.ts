import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('products')
@Check('products_sku_format', `"sku" ~ '^[A-Z0-9][A-Z0-9._-]{0,47}$'`)
@Check('products_name_nonempty', `length(trim("name")) > 0`)
@Check('products_stock_nonnegative', `"stock" >= 0`)
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 48, unique: true })
  sku!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'integer', default: 0 })
  stock!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
