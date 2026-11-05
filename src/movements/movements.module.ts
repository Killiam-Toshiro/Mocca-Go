import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';

@Module({
  imports: [AuthModule],
  controllers: [MovementsController],
  providers: [MovementsService],
})
export class MovementsModule {}
