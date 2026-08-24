import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Role } from '@prisma/client'
import type { Request } from 'express'
import { memoryStorage } from 'multer'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import {
  CreateSupplierInvoiceDto,
  UpdateSupplierInvoiceDraftDto,
} from './dto/supplier-invoice.dto'
import { PDF_MIME, SUPPLIER_INVOICE_PDF_MAX_BYTES } from './supplier-invoices.constants'
import { SupplierInvoicesService } from './supplier-invoices.service'

type AuthedRequest = Request & { user: SessionJwtPayload }

@Controller('backstage/supplier-invoices')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class BackstageSupplierInvoicesController {
  constructor(private readonly supplierInvoices: SupplierInvoicesService) {}

  @Get('drafts/active')
  async getActiveDraft(@Req() req: AuthedRequest) {
    const active = await this.supplierInvoices.getActiveDraft(req.user.userId)
    if (!active) return { draft: null }
    const createPayload = this.supplierInvoices.buildCreateDtoFromDraft(active.meta)
    return { draft: active.meta, pdfBase64: active.pdfBase64, createPayload }
  }

  @Get('drafts/:draftId')
  async getDraft(@Req() req: AuthedRequest, @Param('draftId') draftId: string) {
    const { meta, pdfBase64 } = await this.supplierInvoices.getDraft(req.user.userId, draftId)
    const createPayload = this.supplierInvoices.buildCreateDtoFromDraft(meta)
    return { meta, pdfBase64, createPayload }
  }

  @Post('drafts')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: SUPPLIER_INVOICE_PDF_MAX_BYTES },
    }),
  )
  async createDraft(
    @Req() req: AuthedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('options') optionsRaw?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('PDF файл не передано.')
    }
    if (file.mimetype !== PDF_MIME && !file.originalname.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('Дозволено лише PDF файли.')
    }

    let options: unknown = {}
    if (optionsRaw?.trim()) {
      try {
        options = JSON.parse(optionsRaw)
      } catch {
        throw new BadRequestException('Некоректний JSON у полі options.')
      }
    }

    const result = await this.supplierInvoices.createDraftFromUpload(
      req.user.userId,
      file.originalname || 'invoice.pdf',
      file.buffer,
      options,
    )
    const createPayload = this.supplierInvoices.buildCreateDtoFromDraft(result.meta)
    return { ...result, createPayload }
  }

  @Patch('drafts/:draftId')
  async updateDraft(
    @Req() req: AuthedRequest,
    @Param('draftId') draftId: string,
    @Body() body: UpdateSupplierInvoiceDraftDto,
  ) {
    const meta = await this.supplierInvoices.updateDraft(req.user.userId, draftId, body)
    const createPayload = this.supplierInvoices.buildCreateDtoFromDraft(meta)
    return { meta, createPayload }
  }

  @Delete('drafts/:draftId')
  async deleteDraft(@Req() req: AuthedRequest, @Param('draftId') draftId: string) {
    return this.supplierInvoices.deleteDraft(req.user.userId, draftId)
  }

  @Post('drafts/:draftId/create')
  async createInFlexi(
    @Req() req: AuthedRequest,
    @Param('draftId') draftId: string,
    @Body() body: CreateSupplierInvoiceDto,
  ) {
    return this.supplierInvoices.createInFlexi(req.user.userId, draftId, body)
  }
}
