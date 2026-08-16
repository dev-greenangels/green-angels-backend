import { ArrayMinSize, IsArray, IsEnum, IsUUID } from 'class-validator'

export enum BlogBulkAction {
  PUBLISH = 'publish',
  UNPUBLISH = 'unpublish',
  DELETE = 'delete',
}

export class BlogBulkDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids!: string[]

  @IsEnum(BlogBulkAction)
  action!: BlogBulkAction
}
