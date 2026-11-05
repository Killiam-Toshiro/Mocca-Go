import { ApiProperty } from '@nestjs/swagger';

export class PublicPointResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Edificio A' })
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Se entrega en la plazoleta de auditorios',
  })
  hint!: string | null;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Número de pisos; null si el lugar no tiene pisos.',
    example: 2,
  })
  floors!: number | null;
}

export class PublicZoneResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Zona 1' })
  name!: string;

  @ApiProperty({ type: [PublicPointResponse] })
  points!: PublicPointResponse[];
}

export class PublicZonesResponse {
  @ApiProperty({ type: [PublicZoneResponse] })
  data!: PublicZoneResponse[];
}

export class PointResponse extends PublicPointResponse {
  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({ example: true })
  active!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class ZoneResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Zona 1' })
  name!: string;

  @ApiProperty({ example: true })
  active!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: [PointResponse] })
  points!: PointResponse[];
}

export class ZonesResponse {
  @ApiProperty({ type: [ZoneResponse] })
  data!: ZoneResponse[];
}
