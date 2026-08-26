import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export const LEGAL_DOCUMENT_TYPES = [
  'TERMS',
  'PRIVACY',
  'COOKIES',
  'RETURNS',
  'MARKETING_CONSENT',
] as const
export type LegalDocumentTypeName = (typeof LEGAL_DOCUMENT_TYPES)[number]

export class LegalLocaleQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string
}

export class LegalTypeQueryDto extends LegalLocaleQueryDto {
  @IsOptional()
  @IsIn(LEGAL_DOCUMENT_TYPES)
  type?: LegalDocumentTypeName
}
