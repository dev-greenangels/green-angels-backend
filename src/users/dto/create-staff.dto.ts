import { Role } from '@prisma/client'
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator'

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.MANAGER]

export class CreateStaffDto {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(8)
  password!: string

  @IsString()
  @MinLength(1)
  firstName!: string

  @IsString()
  @MinLength(1)
  lastName!: string

  @IsOptional()
  @IsString()
  patronymic?: string

  @IsIn(STAFF_ROLES)
  role!: Role
}
