import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
