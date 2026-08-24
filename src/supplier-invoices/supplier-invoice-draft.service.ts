import { randomUUID } from 'crypto'

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'

import { RedisService } from '../redis/redis.service'
import {
  SUPPLIER_INVOICE_DRAFT_META_PREFIX,
  SUPPLIER_INVOICE_DRAFT_PDF_PREFIX,
  SUPPLIER_INVOICE_DRAFT_TTL_SEC,
  SUPPLIER_INVOICE_USER_ACTIVE_PREFIX,
} from './supplier-invoices.constants'
import type { SupplierInvoiceDraftMeta } from './supplier-invoice.types'

@Injectable()
export class SupplierInvoiceDraftService {
  constructor(private readonly redis: RedisService) {}

  async createDraft(
    userId: string,
    fileName: string,
    pdfBuffer: Buffer,
    parseOptions: SupplierInvoiceDraftMeta['parseOptions'],
  ): Promise<SupplierInvoiceDraftMeta> {
    const existingId = await this.redis.client.get(`${SUPPLIER_INVOICE_USER_ACTIVE_PREFIX}${userId}`)
    if (existingId) {
      await this.deleteDraft(userId, existingId)
    }

    const draftId = randomUUID()
    const now = new Date().toISOString()
    const meta: SupplierInvoiceDraftMeta = {
      draftId,
      userId,
      fileName,
      parseOptions,
      parsed: null,
      lines: null,
      editedLines: null,
      supplierMatch: null,
      status: 'uploaded',
      createdAt: now,
      parsedAt: null,
    }

    await this.saveMeta(meta)
    await this.redis.client.set(
      `${SUPPLIER_INVOICE_DRAFT_PDF_PREFIX}${draftId}`,
      pdfBuffer.toString('base64'),
      'EX',
      SUPPLIER_INVOICE_DRAFT_TTL_SEC,
    )
    await this.redis.client.set(
      `${SUPPLIER_INVOICE_USER_ACTIVE_PREFIX}${userId}`,
      draftId,
      'EX',
      SUPPLIER_INVOICE_DRAFT_TTL_SEC,
    )

    return meta
  }

  async updateDraftMeta(meta: SupplierInvoiceDraftMeta): Promise<void> {
    await this.assertOwner(meta.userId, meta.draftId)
    await this.saveMeta(meta)
  }

  async getDraft(userId: string, draftId: string): Promise<{ meta: SupplierInvoiceDraftMeta; pdfBase64: string }> {
    await this.assertOwner(userId, draftId)
    const meta = await this.readMeta(draftId)
    if (!meta) {
      throw new NotFoundException('Чернетку інвойсу не знайдено.')
    }
    const pdfBase64 = await this.redis.client.get(`${SUPPLIER_INVOICE_DRAFT_PDF_PREFIX}${draftId}`)
    if (!pdfBase64) {
      throw new NotFoundException('PDF чернетки не знайдено.')
    }
    return { meta, pdfBase64 }
  }

  async getPdfBuffer(draftId: string): Promise<Buffer> {
    const pdfBase64 = await this.redis.client.get(`${SUPPLIER_INVOICE_DRAFT_PDF_PREFIX}${draftId}`)
    if (!pdfBase64) {
      throw new NotFoundException('PDF чернетки не знайдено.')
    }
    return Buffer.from(pdfBase64, 'base64')
  }

  async deleteDraft(userId: string, draftId: string): Promise<void> {
    await this.assertOwner(userId, draftId)
    await this.redis.client.del(
      `${SUPPLIER_INVOICE_DRAFT_META_PREFIX}${draftId}`,
      `${SUPPLIER_INVOICE_DRAFT_PDF_PREFIX}${draftId}`,
    )
    const active = await this.redis.client.get(`${SUPPLIER_INVOICE_USER_ACTIVE_PREFIX}${userId}`)
    if (active === draftId) {
      await this.redis.client.del(`${SUPPLIER_INVOICE_USER_ACTIVE_PREFIX}${userId}`)
    }
  }

  async getActiveDraftId(userId: string): Promise<string | null> {
    return this.redis.client.get(`${SUPPLIER_INVOICE_USER_ACTIVE_PREFIX}${userId}`)
  }

  private async saveMeta(meta: SupplierInvoiceDraftMeta): Promise<void> {
    await this.redis.client.set(
      `${SUPPLIER_INVOICE_DRAFT_META_PREFIX}${meta.draftId}`,
      JSON.stringify(meta),
      'EX',
      SUPPLIER_INVOICE_DRAFT_TTL_SEC,
    )
  }

  private async readMeta(draftId: string): Promise<SupplierInvoiceDraftMeta | null> {
    const raw = await this.redis.client.get(`${SUPPLIER_INVOICE_DRAFT_META_PREFIX}${draftId}`)
    if (!raw) return null
    return JSON.parse(raw) as SupplierInvoiceDraftMeta
  }

  private async assertOwner(userId: string, draftId: string): Promise<void> {
    const meta = await this.readMeta(draftId)
    if (!meta) {
      throw new NotFoundException('Чернетку інвойсу не знайдено.')
    }
    if (meta.userId !== userId) {
      throw new ForbiddenException('Немає доступу до цієї чернетки.')
    }
  }
}
