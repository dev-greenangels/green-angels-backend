import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { randomUUID } from 'crypto'

import { FlexiClient } from '../flexi/flexi.client'
import {
  adresarRefFromRow,
  adresarRowMatchesTaxCandidates,
  buildTaxIdCandidates,
  stableSupplierExtId,
} from '../flexi/flexi-adresar-lookup'
import { FlexiSettingsService } from '../flexi/flexi.settings.service'
import type { MatchConfidence } from './supplier-invoice.types'
import {
  CreateSupplierInvoiceDto,
  CreateWarehouseDocumentDto,
  RematchSupplierInvoiceLinesDto,
  SupplierInvoiceParseOptionsDto,
  UpdateSupplierInvoiceDraftDto,
} from './dto/supplier-invoice.dto'
import {
  buildFakturaPrijataDocument,
  defaultVariableSymbol,
  resolveDueDate,
  resolveReceivedInvoiceDocType,
} from './flexi-faktura-prijata.mapper'
import { buildSkladovyPohybDocument } from './flexi-skladovy-pohyb.mapper'
import { GeminiInvoiceParserService } from './gemini-invoice-parser.service'
import { InvoiceProductMatcherService } from './invoice-product-matcher.service'
import { SupplierInvoiceDraftService } from './supplier-invoice-draft.service'
import type {
  CreateFakturaPrijataResult,
  CreateWarehouseDocumentResult,
  GeminiParsedInvoice,
  InvoiceLinePreview,
  SupplierInvoiceDraftMeta,
  SupplierInvoiceParseOptions,
  SupplierInvoiceSendRecord,
} from './supplier-invoice.types'

@Injectable()
export class SupplierInvoicesService {
  private readonly logger = new Logger(SupplierInvoicesService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly draftService: SupplierInvoiceDraftService,
    private readonly geminiParser: GeminiInvoiceParserService,
    private readonly matcher: InvoiceProductMatcherService,
    private readonly flexiClient: FlexiClient,
    private readonly flexiSettings: FlexiSettingsService,
  ) {}

  async createDraftFromUpload(
    userId: string,
    fileName: string,
    pdfBuffer: Buffer,
    optionsRaw: unknown,
  ): Promise<{ meta: SupplierInvoiceDraftMeta; pdfBase64: string; warnings: string[] }> {
    const options = await this.validateParseOptions(optionsRaw)
    const meta = await this.draftService.createDraft(userId, fileName, pdfBuffer, options)
    const warnings: string[] = []

    try {
      const parsed = await this.geminiParser.parsePdf(pdfBuffer, options)
      const lines = await this.matcher.matchInvoice(parsed, options)
      const supplierMatch = await this.matchSupplier(parsed)

      meta.parsed = parsed
      meta.lines = lines
      meta.editedLines = lines
      meta.supplierMatch = supplierMatch
      meta.status = 'parsed'
      meta.parsedAt = new Date().toISOString()
      await this.draftService.updateDraftMeta(meta)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(message)
      this.logger.warn(`Parse failed for draft ${meta.draftId}: ${message}`)
    }

    const { pdfBase64 } = await this.draftService.getDraft(userId, meta.draftId)
    return { meta, pdfBase64, warnings }
  }

  async getDraft(userId: string, draftId: string) {
    return this.draftService.getDraft(userId, draftId)
  }

  async getActiveDraft(userId: string) {
    const draftId = await this.draftService.getActiveDraftId(userId)
    if (!draftId) return null
    return this.draftService.getDraft(userId, draftId)
  }

  async updateDraft(userId: string, draftId: string, body: UpdateSupplierInvoiceDraftDto) {
    const { meta } = await this.draftService.getDraft(userId, draftId)
    if (!meta.parsed) {
      throw new BadRequestException('Спочатку завантажте та розпарсіть PDF.')
    }

    meta.editedLines = body.editedLines.map((line) => ({
      lineIndex: line.lineIndex,
      rawName: line.rawName,
      sku: undefined,
      ean: undefined,
      quantity: line.quantity,
      unit: undefined,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      batchNumber: line.batchNumber,
      stockCode: line.stockCode,
      vatRate: line.vatRate,
      matchedProduct: line.productId
        ? {
            productId: line.productId,
            variantId: line.variantId ?? line.productId,
            slug: '',
            name: line.displayName ?? line.rawName,
            sku: line.abraCode,
            ean: null,
          }
        : null,
      matchedFlexiCenik: {
        id: '',
        kod: line.abraCode,
        nazev: line.displayName ?? line.rawName,
      },
      matchConfidence: 'exact' as MatchConfidence,
      matchSource: line.productId ? 'site-db' : 'flexi-cenik',
      suggestedAbraId: line.abraCode,
      fuzzyCandidates: [],
    })) as InvoiceLinePreview[]

    await this.draftService.updateDraftMeta(meta)
    return meta
  }

  async deleteDraft(userId: string, draftId: string): Promise<{ ok: true }> {
    await this.draftService.deleteDraft(userId, draftId)
    return { ok: true }
  }

  async rematchLines(
    userId: string,
    draftId: string,
    body: RematchSupplierInvoiceLinesDto,
  ): Promise<SupplierInvoiceDraftMeta> {
    const { meta } = await this.draftService.getDraft(userId, draftId)
    if (!meta.parsed) {
      throw new BadRequestException('Спочатку завантажте та розпарсіть PDF.')
    }
    const current = meta.editedLines ?? meta.lines
    if (!current?.length) {
      throw new BadRequestException('Немає рядків для повторного зіставлення.')
    }

    const sizeLabel = body.sizeLabel.trim()
    if (!sizeLabel) {
      throw new BadRequestException('Вкажіть розмір / тип (C2, CUT, …).')
    }

    const rematched = await this.matcher.rematchLines(
      current,
      meta.parseOptions,
      sizeLabel,
      body.lineIndexes,
    )
    meta.editedLines = rematched
    meta.parseOptions = {
      ...meta.parseOptions,
      defaultSizeLabel: sizeLabel,
    }
    await this.draftService.updateDraftMeta(meta)
    return meta
  }

  async createInFlexi(
    userId: string,
    draftId: string,
    dtoRaw: CreateSupplierInvoiceDto,
  ): Promise<CreateFakturaPrijataResult> {
    const dto = plainToInstance(CreateSupplierInvoiceDto, dtoRaw)
    const errors = await validate(dto)
    if (errors.length > 0) {
      throw new BadRequestException('Некоректні дані для створення накладної.')
    }

    const settings = await this.flexiSettings.getSettings()
    if (!settings.enabled || !settings.baseUrl || !settings.companyId) {
      throw new BadRequestException('ABRA Flexi не налаштовано.')
    }

    const { meta } = await this.draftService.getDraft(userId, draftId)
    if (!meta.parsed) {
      throw new BadRequestException('Чернетка не містить розпарсених даних.')
    }

    if (dto.lines.length === 0) {
      throw new BadRequestException('Додайте хоча б один рядок товару.')
    }

    if (!dto.issueDate?.trim()) {
      throw new BadRequestException('Вкажіть дату виставлення (datVyst).')
    }
    if (!resolveDueDate(dto)) {
      throw new BadRequestException('Вкажіть термін оплати / splatnost (datSplat).')
    }

    const firmaRef = await this.ensureSupplierAdresar(dto, meta.parsed)
    const typDokl = resolveReceivedInvoiceDocType(
      settings,
      this.config.get<string>('FLEXI_RECEIVED_INVOICE_DOC_TYPE') ?? 'FAKTURA',
    )

    const notes: string[] = []
    const deliveryNote = dto.deliveryNoteNumber?.trim() ?? meta.parsed.invoice.deliveryNoteNumber?.trim()
    const orderRef = dto.orderReference?.trim() ?? meta.parsed.invoice.orderReference?.trim()
    if (deliveryNote) {
      notes.push(`Dodací list: ${deliveryNote}`)
    }
    if (orderRef) {
      notes.push(`Objednávka: ${orderRef}`)
    }
    if (meta.parsed.unmappedFields?.length) {
      notes.push(...meta.parsed.unmappedFields.slice(0, 10))
    }

    const externalId = `ext:GA:inv:${randomUUID()}`
    const document = buildFakturaPrijataDocument({
      dto,
      firmaRef,
      typDoklCode: typDokl,
      centerCode: settings.centerCode,
      noStockCenikKods: [
        settings.boxesCenikKod,
        settings.shippingCenikKod,
        settings.codFeeCenikKod,
        'BOXES',
        'SHIPPING',
        'COD',
      ],
      externalId,
      notes,
    })

    let nativeId: string | null = null
    let nativeKod: string | null = null
    let attachmentOk = false

    try {
      const write = await this.flexiClient.putFakturaPrijata(document)
      nativeId = write.nativeId
      nativeKod = write.ref

      if (nativeId) {
        try {
          const pdfBuffer = await this.draftService.getPdfBuffer(draftId)
          await this.flexiClient.putFakturaPrijataAttachment(nativeId, meta.fileName, pdfBuffer)
          attachmentOk = true
        } catch (attachError) {
          const message = attachError instanceof Error ? attachError.message : String(attachError)
          this.logger.warn(`Attachment failed for ${nativeId}: ${message}`)
        }
      }

      const result: CreateFakturaPrijataResult = {
        ok: true,
        externalId,
        nativeId: nativeId ?? undefined,
        nativeKod: nativeKod ?? undefined,
        attachmentOk,
        message: attachmentOk
          ? 'Прибуткову накладну створено в ABRA Flexi з PDF-вкладенням.'
          : 'Прибуткову накладну створено в ABRA Flexi (PDF-вкладення не вдалося).',
      }

      await this.appendSend(meta, {
        kind: 'invoice',
        at: new Date().toISOString(),
        ok: true,
        externalId,
        nativeKod: nativeKod ?? undefined,
        message: result.message,
      })
      meta.status = 'submitted-invoice'
      await this.draftService.updateDraftMeta(meta)

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`createInFlexi failed: ${message}`)
      await this.appendSend(meta, {
        kind: 'invoice',
        at: new Date().toISOString(),
        ok: false,
        message,
      })
      await this.draftService.updateDraftMeta(meta)
      return { ok: false, attachmentOk: false, message }
    }
  }

  async createWarehouseInFlexi(
    userId: string,
    draftId: string,
    dtoRaw: CreateWarehouseDocumentDto,
  ): Promise<CreateWarehouseDocumentResult> {
    const dto = plainToInstance(CreateWarehouseDocumentDto, dtoRaw)
    const errors = await validate(dto)
    if (errors.length > 0) {
      throw new BadRequestException('Некоректні дані для складського документа.')
    }

    const settings = await this.flexiSettings.getSettings()
    if (!settings.enabled || !settings.baseUrl || !settings.companyId) {
      throw new BadRequestException('ABRA Flexi не налаштовано.')
    }

    const { meta } = await this.draftService.getDraft(userId, draftId)
    if (!meta.parsed) {
      throw new BadRequestException('Чернетка не містить розпарсених даних.')
    }

    if (dto.lines.length === 0) {
      throw new BadRequestException('Додайте хоча б один рядок товару.')
    }
    if (!dto.issueDate?.trim()) {
      throw new BadRequestException('Вкажіть дату документа (datVyst).')
    }
    if (dto.voucherType === 'PREVODKA' && !dto.targetStockCode?.trim()) {
      throw new BadRequestException('Для PŘEVODKA вкажіть цільовий склад (skladCil).')
    }
    if (!dto.stockCode?.trim() && !dto.lines.some((l) => l.stockCode?.trim())) {
      throw new BadRequestException('Вкажіть склад (sklad) для документа або рядків.')
    }
    if (dto.lines.some((l) => !l.abraCode.trim())) {
      throw new BadRequestException('Усі рядки повинні мати код Abra (cenik).')
    }

    const { document, externalId, needsPrevodkaComplete } = buildSkladovyPohybDocument({
      dto: {
        ...dto,
        stockCode: dto.stockCode?.trim() || meta.parseOptions.targetStockCode,
      },
      noStockCenikKods: [
        settings.boxesCenikKod,
        settings.shippingCenikKod,
        settings.codFeeCenikKod,
        'BOXES',
        'SHIPPING',
        'COD',
      ],
    })

    try {
      const write = await this.flexiClient.putSkladovyPohyb(document)
      const nativeId = write.nativeId
      const nativeKod = write.ref

      if (needsPrevodkaComplete && nativeId) {
        try {
          await this.flexiClient.completePrevodka(nativeId)
        } catch (completeError) {
          const message =
            completeError instanceof Error ? completeError.message : String(completeError)
          this.logger.warn(`dokoncit-prevodku failed for ${nativeId}: ${message}`)
          const result: CreateWarehouseDocumentResult = {
            ok: true,
            externalId,
            nativeId: nativeId ?? undefined,
            nativeKod: nativeKod ?? undefined,
            message: `Складський документ створено, але dokončit převodku не вдалося: ${message}`,
          }
          await this.appendSend(meta, {
            kind: 'warehouse',
            at: new Date().toISOString(),
            ok: true,
            externalId,
            nativeKod: nativeKod ?? undefined,
            message: result.message,
            voucherType: dto.voucherType,
            movement: dto.movement,
          })
          meta.status = 'submitted-warehouse'
          await this.draftService.updateDraftMeta(meta)
          return result
        }
      }

      const result: CreateWarehouseDocumentResult = {
        ok: true,
        externalId,
        nativeId: nativeId ?? undefined,
        nativeKod: nativeKod ?? undefined,
        message: needsPrevodkaComplete
          ? 'Převodka створена і завершена в ABRA Flexi.'
          : 'Складський документ створено в ABRA Flexi.',
      }

      await this.appendSend(meta, {
        kind: 'warehouse',
        at: new Date().toISOString(),
        ok: true,
        externalId,
        nativeKod: nativeKod ?? undefined,
        message: result.message,
        voucherType: dto.voucherType,
        movement: dto.movement,
      })
      meta.status = 'submitted-warehouse'
      await this.draftService.updateDraftMeta(meta)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`createWarehouseInFlexi failed: ${message}`)
      await this.appendSend(meta, {
        kind: 'warehouse',
        at: new Date().toISOString(),
        ok: false,
        message,
        voucherType: dto.voucherType,
        movement: dto.movement,
      })
      await this.draftService.updateDraftMeta(meta)
      return { ok: false, message }
    }
  }

  private async appendSend(
    meta: SupplierInvoiceDraftMeta,
    record: SupplierInvoiceSendRecord,
  ): Promise<void> {
    if (!Array.isArray(meta.sends)) meta.sends = []
    meta.sends = [...meta.sends, record].slice(-20)
  }

  buildCreateDtoFromDraft(meta: SupplierInvoiceDraftMeta): CreateSupplierInvoiceDto | null {
    if (!meta.parsed) return null
    const lines = meta.editedLines ?? meta.lines
    if (!lines?.length) return null

    const inv = meta.parsed.invoice
    return {
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate ?? inv.taxDate ?? inv.issueDate,
      taxDate: inv.taxDate,
      currency: inv.currency,
      variableSymbol: defaultVariableSymbol(inv.invoiceNumber),
      orderReference: inv.orderReference,
      deliveryNoteNumber: inv.deliveryNoteNumber,
      targetStockCode: meta.parseOptions.targetStockCode,
      priceIncludesVat: meta.parseOptions.priceIncludesVat,
      supplierName: meta.parsed.supplier.name,
      supplierIco: meta.parsed.supplier.ico,
      supplierDic: meta.parsed.supplier.dic,
      supplierVatId: meta.parsed.supplier.vatId,
      supplierAddress: meta.parsed.supplier.address,
      lines: lines.map((line) => ({
        lineIndex: line.lineIndex,
        rawName: line.rawName,
        abraCode: line.suggestedAbraId?.trim() || '',
        productId: line.matchedProduct?.productId,
        variantId: line.matchedProduct?.variantId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        batchNumber: line.batchNumber,
        stockCode: line.stockCode ?? meta.parseOptions.targetStockCode,
        vatRate: line.vatRate,
        displayName: line.rawName,
      })),
    }
  }

  private async validateParseOptions(raw: unknown): Promise<SupplierInvoiceParseOptions> {
    const dto = plainToInstance(SupplierInvoiceParseOptionsDto, raw)
    const errors = await validate(dto)
    if (errors.length > 0) {
      throw new BadRequestException('Некоректні параметри парсингу.')
    }
    return dto
  }

  private async matchSupplier(parsed: GeminiParsedInvoice): Promise<{
    abraRef: string | null
    matchConfidence: MatchConfidence
  }> {
    const candidates = buildTaxIdCandidates({
      ico: parsed.supplier.ico,
      vatId: parsed.supplier.vatId,
      dic: parsed.supplier.dic,
      countryHint: parsed.supplier.country,
    })
    if (candidates.length === 0) {
      return { abraRef: null, matchConfidence: 'none' }
    }
    const byTax = await this.flexiClient.findAdresarByTaxCandidates(candidates)
    if (byTax) {
      return {
        abraRef: adresarRefFromRow(byTax) || null,
        matchConfidence: 'exact',
      }
    }
    return { abraRef: null, matchConfidence: 'none' }
  }

  private async ensureSupplierAdresar(
    dto: CreateSupplierInvoiceDto,
    parsed: GeminiParsedInvoice,
  ): Promise<string> {
    const candidates = buildTaxIdCandidates({
      ico: dto.supplierIco ?? parsed.supplier.ico,
      vatId: dto.supplierVatId ?? parsed.supplier.vatId,
      dic: dto.supplierDic ?? parsed.supplier.dic,
      countryHint: parsed.supplier.country,
    })

    if (candidates.length > 0) {
      const existing = await this.flexiClient.findAdresarByTaxCandidates(candidates)
      if (existing && adresarRowMatchesTaxCandidates(existing, candidates)) {
        const ref = adresarRefFromRow(existing)
        if (ref) {
          this.logger.log(
            `ensureSupplierAdresar: reuse by tax ${ref} nazev=${String(existing.nazev ?? '')}`,
          )
          return ref
        }
      }
    }

    const extId = stableSupplierExtId(candidates.length ? candidates : [`${Date.now()}`])
    const existingExt = await this.flexiClient.findAdresarByExtId(extId)
    if (existingExt) {
      const taxOk =
        candidates.length === 0 || adresarRowMatchesTaxCandidates(existingExt, candidates)
      if (taxOk) {
        const ref = adresarRefFromRow(existingExt)
        if (ref) {
          this.logger.log(`ensureSupplierAdresar: reuse by ext ${ref}`)
          return ref
        }
        return extId
      }
      this.logger.warn(
        `ensureSupplierAdresar: ext ${extId} hit nazev=${String(existingExt.nazev ?? '')} but tax mismatch — will create`,
      )
    }

    const digits = candidates.map((c) => c.replace(/\D/g, '')).find((d) => d.length >= 6)
    const vatPrefixed = candidates.find((c) => /^[A-Z]{2}/i.test(c) && c.replace(/\D/g, '').length >= 6)

    const adresar: Record<string, unknown> = {
      id: extId,
      nazev: dto.supplierName.trim() || parsed.supplier.name,
    }
    if (digits) adresar.ic = digits
    if (vatPrefixed) adresar.vatId = vatPrefixed.toUpperCase()
    else if (dto.supplierVatId?.trim()) adresar.vatId = dto.supplierVatId.trim()
    if (dto.supplierDic?.trim()) adresar.dic = dto.supplierDic.trim()
    else if (parsed.supplier.dic?.trim()) adresar.dic = parsed.supplier.dic.trim()
    if (dto.supplierAddress?.trim()) adresar.ulice = dto.supplierAddress.trim()
    if (parsed.supplier.email) adresar.email = parsed.supplier.email
    if (parsed.supplier.phone) adresar.tel = parsed.supplier.phone

    const write = await this.flexiClient.putAdresar(adresar)
    this.logger.log(
      `ensureSupplierAdresar: created ext=${extId} nativeId=${write.nativeId ?? '?'} nazev=${String(adresar.nazev)}`,
    )

    const created = await this.flexiClient.findAdresarByExtId(extId)
    if (
      created &&
      (candidates.length === 0 || adresarRowMatchesTaxCandidates(created, candidates))
    ) {
      const ref = adresarRefFromRow(created)
      if (ref) return ref
    }
    if (write.nativeId) return write.nativeId
    return extId
  }
}
