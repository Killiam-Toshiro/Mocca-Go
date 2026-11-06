import { ApiProperty } from '@nestjs/swagger';
import { PageResponse } from '../common/openapi';

export class SurveyResponse {
  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5, example: 5 })
  rating!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Llegó caliente y rápido',
  })
  comment!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class SurveyCustomerResponse {
  @ApiProperty({ example: 'Ana Pérez' })
  name!: string;
}

export class SurveyRowResponse extends SurveyResponse {
  @ApiProperty({ example: 1042 })
  number!: number;

  @ApiProperty({ type: SurveyCustomerResponse })
  customer!: SurveyCustomerResponse;

  @ApiProperty({ example: 'Zona 1' })
  zoneName!: string;
}

export class SurveyPageResponse extends PageResponse {
  @ApiProperty({ type: [SurveyRowResponse] })
  data!: SurveyRowResponse[];
}
