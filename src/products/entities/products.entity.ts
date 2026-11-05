import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ProductCategory =
  'cafe' | 'bebida' | 'panaderia' | 'pasteleria' | 'snack' | 'combo';
/** Orden de presentación del menú. */
export const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  'combo',
  'cafe',
  'bebida',
  'panaderia',
  'pasteleria',
  'snack',
];
export type SimpleCategory = Exclude<ProductCategory, 'combo'>;
export const SIMPLE_CATEGORIES: readonly SimpleCategory[] = [
  'cafe',
  'bebida',
  'panaderia',
  'pasteleria',
  'snack',
];

@Entity('products')
@Check('products_sku_format', `"sku" ~ '^[A-Z0-9][A-Z0-9._-]{0,47}$'`)
@Check('products_name_nonempty', `length(trim("name")) > 0`)
@Check('products_stock_nonnegative', `"stock" >= 0`)
@Check(
  'products_category_valid',
  `"category" IN ('cafe', 'bebida', 'panaderia', 'pasteleria', 'snack', 'combo')`,
)
@Check('products_price_range', `"price" BETWEEN 0 AND 1000000`)
@Check('products_cost_range', `"cost" BETWEEN 0 AND 1000000`)
@Check('products_combo_no_stock', `"category" <> 'combo' OR "stock" = 0`)
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

  @Column({ type: 'varchar', length: 16, default: 'snack' })
  category!: ProductCategory;

  @Column({ type: 'integer', default: 0 })
  price!: number;

  @Column({ type: 'integer', default: 0 })
  cost!: number;

  @Column({ name: 'sold_out', type: 'boolean', default: false })
  soldOut!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
