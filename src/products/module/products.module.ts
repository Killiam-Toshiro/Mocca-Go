import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ProductsController } from '../controller/products.controller';
import { ProductsService } from '../services/products.services';

@Module({
  imports: [AuthModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
