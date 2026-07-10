import { ArrayMinSize, IsArray, IsEnum } from 'class-validator'
import { VariantAttributeType } from '@prisma/client'

export class UpdateVariantLabelSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(VariantAttributeType, { each: true })
  labelTypeOrder!: VariantAttributeType[]
}
