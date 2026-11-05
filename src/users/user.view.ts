import { User, UserRole } from './entities/user.entity';

export interface UserView {
  id: string;
  username: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export function userView(user: User): UserView {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
