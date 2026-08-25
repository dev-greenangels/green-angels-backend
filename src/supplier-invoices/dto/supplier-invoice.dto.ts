import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

import { GEMINI_INVOICE_MODELS } from '../supplier-invoices.constants'

export class SupplierInvoiceParseOptionsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  defaultSizeLabel!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  targetStockCode!: string

  @IsBoolean()
  priceIncludesVat!: boolean

  @IsString()
  @IsIn(['uk', 'en', 'sk', 'hu', 'de', 'cs'])
  locale!: string

  @IsOptional()
  @IsString()
  @IsIn([...GEMINI_INVOICE_MODELS])
  geminiModel?: string
}

export class CreateInvoiceLineDto {
  @IsInt()
  @Min(0)
  lineIndex!: number

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  rawName!: string

  /** May be empty while editing / before rematch; create endpoints enforce non-empty. */
  @IsString()
  @MaxLength(64)
  abraCode!: string

  @IsOptional()
  @IsUUID()
  productId?: string

  @IsOptional()
  @IsUUID()
  variantId?: string

  @IsNumber()
  @Min(0.0001)
  quantity!: number

  @IsNumber()
  @Min(0)
  unitPrice!: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  lineTotal?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  vatRate?: number

  @IsOptional()
  @IsString()
  @MaxLength(500)
  displayName?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  batchNumber?: string

  /** Per-line warehouse; empty string = no sklad on Flexi row. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  stockCode?: string
}

export class CreateSupplierInvoiceDto {
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  @IsArray()
  lines!: CreateInvoiceLineDto[]

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  invoiceNumber!: string

  @IsString()
  @IsNotEmpty()
  issueDate!: string

  @IsOptional()
  @IsString()
  dueDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(10)
  taxDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  variableSymbol?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderReference?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deliveryNoteNumber?: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  currency!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  targetStockCode!: string

  @IsBoolean()
  priceIncludesVat!: boolean

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  supplierName!: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  supplierIco?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  supplierDic?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  supplierVatId?: string

  @IsOptional()
  @IsString()
  @MaxLength(256)
  supplierAddress?: string
}

export class UpdateSupplierInvoiceDraftDto {
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  @IsArray()
  editedLines!: CreateInvoiceLineDto[]
}

export class RematchSupplierInvoiceLinesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  sizeLabel!: string

  /** Empty / omitted = rematch all lines. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  lineIndexes?: number[]
}

export class CreateWarehouseDocumentDto {
  @IsIn(['STANDARD', 'VYROBA', 'PREVODKA'])
  voucherType!: 'STANDARD' | 'VYROBA' | 'PREVODKA'

  @IsIn(['prijem', 'vydej'])
  movement!: 'prijem' | 'vydej'

  @IsString()
  @IsNotEmpty()
  issueDate!: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  stockCode?: string

  /** Target warehouse for PREVODKA (skladCil). */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  targetStockCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string

  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  @IsArray()
  lines!: CreateInvoiceLineDto[]
}
