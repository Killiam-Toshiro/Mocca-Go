import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { Identity } from '../auth/auth.service';
import { isConstraintViolation } from '../common/database-errors';
import { hashPassword } from '../seed/password';
import { User } from '../users/entities/user.entity';
import { RegisterCustomerDto, UpdateCustomerDto } from './customers.dto';
import { Customer } from './entities/customer.entity';

export const EMAIL_TAKEN = 'El correo ya está registrado.';
export const CUSTOMER_NOT_FOUND = 'Perfil de cliente no encontrado.';
const CUSTOMER_EMAIL_KEY = 'customers_email_key';

export interface CustomerView {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

export function customerView(customer: Customer): CustomerView {
  return {
    id: customer.userId,
    email: customer.email,
    fullName: customer.fullName,
    phone: customer.phone,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(private readonly source: DataSource) {}

  /**
   * Registra un cliente (RN-20): `users` y `customers` en una sola
   * transacción. El username es interno y se deriva del id generado.
   */
  async register(input: RegisterCustomerDto): Promise<CustomerView> {
    const passwordHash = await hashPassword(input.password);
    const id = randomUUID();
    try {
      return await this.source.transaction(async (manager) => {
        await manager.insert(User, {
          id,
          username: `c${id.replaceAll('-', '').slice(0, 16)}`,
          role: 'cliente',
          passwordHash,
        });
        await manager.insert(Customer, {
          userId: id,
          email: input.email,
          fullName: input.fullName,
          phone: input.phone,
        });
        return customerView(
          await manager.getRepository(Customer).findOneByOrFail({ userId: id }),
        );
      });
    } catch (error) {
      if (isConstraintViolation(error, '23505', CUSTOMER_EMAIL_KEY))
        throw new ConflictException(EMAIL_TAKEN);
      if (error instanceof QueryFailedError) {
        // El cliente recibe un mensaje genérico; la causa queda en el log.
        this.logger.error(`Registro de cliente fallido: ${error.message}`);
        throw new InternalServerErrorException('No se pudo registrar.');
      }
      throw error;
    }
  }

  async profile(identity: Identity): Promise<CustomerView> {
    const customer = await this.source
      .getRepository(Customer)
      .findOneBy({ userId: identity.id });
    if (!customer) throw new NotFoundException(CUSTOMER_NOT_FOUND);
    return customerView(customer);
  }

  /** Solo escribe lo que cambia, así que repetir valores no toca `updatedAt`. */
  async updateProfile(
    identity: Identity,
    input: UpdateCustomerDto,
  ): Promise<CustomerView> {
    if (input.fullName === undefined && input.phone === undefined)
      throw new BadRequestException('Indica al menos un campo para editar.');
    return this.source.transaction(async (manager) => {
      const repository = manager.getRepository(Customer);
      const customer = await repository
        .createQueryBuilder('customer')
        .where('customer.userId = :id', { id: identity.id })
        .setLock('pessimistic_write')
        .getOne();
      if (!customer) throw new NotFoundException(CUSTOMER_NOT_FOUND);
      const changes: Partial<Pick<Customer, 'fullName' | 'phone'>> = {};
      if (input.fullName !== undefined && input.fullName !== customer.fullName)
        changes.fullName = input.fullName;
      if (input.phone !== undefined && input.phone !== customer.phone)
        changes.phone = input.phone;
      if (Object.keys(changes).length === 0) return customerView(customer);
      await repository.update({ userId: identity.id }, changes);
      return customerView(
        await repository.findOneByOrFail({ userId: identity.id }),
      );
    });
  }
}
