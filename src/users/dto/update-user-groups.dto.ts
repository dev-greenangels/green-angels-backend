import { IsArray, IsUUID } from 'class-validator'

export class UpdateUserGroupsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  groupIds!: string[]
}
