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
  @MaxLength(100)
  customerFirstName!: string

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  customerLastName!: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerPatronymic?: string

  @IsString()
  @MinLength(10)
  @MaxLength(30)
  customerPhone!: string

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  customerEmail?: string

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  receiverFirstName!: string

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  receiverLastName!: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiverPatronymic?: string

  @IsString()
  @MinLength(10)
  @MaxLength(30)
  receiverPhone!: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  deliveryMethod!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveryCity?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryBranch?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryStreet?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  deliveryHouseNumber?: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  paymentMethod!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoCode?: string
}
