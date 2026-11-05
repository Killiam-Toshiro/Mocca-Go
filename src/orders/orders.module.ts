import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MovementsModule } from '../movements/movements.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, MovementsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
