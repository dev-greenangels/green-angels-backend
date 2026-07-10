import { Type } from 'class-transformer'
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator'

export class DeliveryDefaultsDto {
  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  branch?: string

  @IsOptional()
  @IsString()
  street?: string

  @IsOptional()
  @IsString()
  houseNumber?: string

  @IsOptional()
  @IsIn(['nova-poshta-branch', 'nova-poshta-address', 'pickup'])
  method?: string
}

export class UpdateAccountProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string

  @IsOptional()
  @IsString()
  patronymic?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryDefaultsDto)
  deliveryDefaults?: DeliveryDefaultsDto
}
