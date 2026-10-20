import { Role } from '@prisma/client'
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator'

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.MANAGER]
const CUSTOMER_ROLES: Role[] = [Role.USER, Role.WHOLESALER]

/** Flexi adresar.kod / cenikova-skupina.kod — not a DB UUID. */
const FLEXI_KOD_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  patronymic?: string | null

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  phone?: string | null

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string

  @IsOptional()
  @IsIn([...STAFF_ROLES, ...CUSTOMER_ROLES])
  role?: Role

  /**
   * Flexi adresar.kod for COMPANY Sales Prices.
   * Empty string / null clears. Only allowed when effective role is WHOLESALER.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @MaxLength(64)
  @Matches(FLEXI_KOD_PATTERN, {
    message: 'flexiFirmaKod має бути кодом ABRA (не UUID).',
  })
  flexiFirmaKod?: string | null

  /**
   * Flexi cenikova-skupina.kod for GROUP Sales Prices.
   * Empty string / null clears (market default may still apply).
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @MaxLength(64)
  @Matches(FLEXI_KOD_PATTERN, {
    message: 'flexiSkupCenKod має бути кодом ABRA (не UUID).',
  })
  flexiSkupCenKod?: string | null
}
