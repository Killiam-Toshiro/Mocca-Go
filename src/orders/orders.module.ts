import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MovementsModule } from '../movements/movements.module';
import { SurveysModule } from '../surveys/surveys.module';
import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';
import {
  DEFAULT_STREAM_OPTIONS,
  OrderNotificationsService,
  STREAM_OPTIONS,
} from './notifications/order-notifications.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, MovementsModule, SurveysModule],
  controllers: [OrdersController, KitchenController],
  providers: [
    OrdersService,
    KitchenService,
    OrderNotificationsService,
    { provide: STREAM_OPTIONS, useValue: DEFAULT_STREAM_OPTIONS },
  ],
  exports: [OrderNotificationsService],
})
export class OrdersModule {}
