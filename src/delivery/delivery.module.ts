import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveryPointsController } from './controllers/delivery-points.controller';
import { DeliveryZonesController } from './controllers/delivery-zones.controller';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [AuthModule],
  controllers: [DeliveryZonesController, DeliveryPointsController],
  providers: [DeliveryService],
})
export class DeliveryModule {}
