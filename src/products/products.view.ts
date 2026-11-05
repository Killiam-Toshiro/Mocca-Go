import { Product } from './entities/products.entity';

export interface ProductView {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  active: boolean;
  stock: number;
  createdAt: Date;
  updatedAt: Date;
}

export function productView(product: Product): ProductView {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    active: product.active,
    stock: product.stock,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
