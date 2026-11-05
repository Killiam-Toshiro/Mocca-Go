import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Product } from './products.entity';

@Entity('product_components')
@Check('product_components_quantity_range', `"quantity" BETWEEN 1 AND 10`)
@Check('product_components_not_self', `"combo_id" <> "component_id"`)
export class ProductComponent {
  @PrimaryColumn({ name: 'combo_id', type: 'uuid' })
  comboId!: string;

  @PrimaryColumn({ name: 'component_id', type: 'uuid' })
  componentId!: string;

  @Column({ type: 'integer' })
  quantity!: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'combo_id' })
  combo?: Product;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'component_id' })
  component?: Product;
}
