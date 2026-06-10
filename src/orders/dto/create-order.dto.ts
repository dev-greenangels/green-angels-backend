import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'

import { CreateOrderItemDto } from './create-order-item.dto'

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[]

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  customerName!: string

  @IsString()
  @MinLength(10)
  @MaxLength(30)
  customerPhone!: string

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  customerEmail?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiverName?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  receiverPhone?: string

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  deliveryCity!: string

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  deliveryWarehouse!: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  deliveryMethod!: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  paymentMethod!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string
}
