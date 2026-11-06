import {
  ComponentState,
  comboCost,
  comboStock,
  costPercent,
  isAvailable,
} from './catalog';
import { Product, ProductCategory } from './entities/products.entity';

/** Componente de un combo con el estado que necesitan los cálculos. */
export interface ComponentRow extends ComponentState {
  productId: string;
  sku: string;
  name: string;
}

export interface ComponentView {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
}

export interface ProductView {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  price: number;
  cost: number;
  costPercent: number | null;
  soldOut: boolean;
  available: boolean;
  active: boolean;
  stock: number;
  components: ComponentView[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MenuItemView {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  price: number;
  available: boolean;
  components: { name: string; quantity: number }[];
}

/**
 * Vista de un producto. En un combo, `cost`, `stock` y `available` se calculan
 * a partir de sus componentes (RN-31 a RN-33); en uno simple salen de la fila.
 */
export function productView(
  product: Product,
  rows: readonly ComponentRow[] = [],
): ProductView {
  const isCombo = product.category === 'combo';
  const cost = isCombo ? comboCost(rows) : product.cost;
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price,
    cost,
    costPercent: costPercent(cost, product.price),
    soldOut: product.soldOut,
    available: isAvailable({
      ...product,
      components: isCombo ? rows : undefined,
    }),
    active: product.active,
    stock: isCombo ? comboStock(rows) : product.stock,
    components: rows.map((row) => ({
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      quantity: row.quantity,
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function menuItemView(
  product: Product,
  rows: readonly ComponentRow[] = [],
): MenuItemView {
  const view = productView(product, rows);
  return {
    id: view.id,
    sku: view.sku,
    name: view.name,
    description: view.description,
    category: view.category,
    price: view.price,
    available: view.available,
    components: view.components.map(({ name, quantity }) => ({
      name,
      quantity,
    })),
  };
}
