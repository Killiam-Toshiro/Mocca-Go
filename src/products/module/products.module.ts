import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MenuController } from '../controller/menu.controller';
import { ProductsController } from '../controller/products.controller';
import { ProductsService } from '../services/products.services';

@Module({
  imports: [AuthModule],
  controllers: [ProductsController, MenuController],
  providers: [ProductsService],
})
export class ProductsModule {}
