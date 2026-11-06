import { Customer } from '../customers/entities/customer.entity';
import { User, UserRole } from './entities/user.entity';

export interface UserView {
  id: string;
  username: string;
  role: UserRole;
  /** Datos de contacto: los clientes los traen de su ficha; el personal, de su cuenta (puede ser `null`). */
  email: string | null;
  fullName: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function userView(user: User, customer?: Customer | null): UserView {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    email: customer?.email ?? null,
    fullName: customer?.fullName ?? user.fullName ?? null,
    phone: customer?.phone ?? user.phone ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
