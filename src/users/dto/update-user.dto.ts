import { Role } from '@prisma/client'
import { IsEmail, IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator'

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.MANAGER]
const CUSTOMER_ROLES: Role[] = [Role.USER, Role.WHOLESALER]

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
}
