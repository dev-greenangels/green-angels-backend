import { Injectable, Logger } from '@nestjs/common'

import { DpdSettingsService } from './dpd.settings.service'
import type {
  DpdCreateShipmentInput,
  DpdCreateShipmentResult,
  DpdLabelResult,
  DpdTrackingResult,
} from './dpd.types'

/**
 * Klient pro DPD (kurýrní doručení SK/EU). Fáze C — pouze rozhraní a no-op
 * implementace se soft-degrade, dokud nejsou k dispozici přístupové údaje
 * klienta (API URL, client ID/secret). Skutečná REST integrace bude
 * dopracována podle dokumentace DPD API.
 */
@Injectable()
export class DpdService {
  private readonly logger = new Logger(DpdService.name)

  constructor(private readonly settings: DpdSettingsService) {}

  async isConfigured(): Promise<boolean> {
    const settings = await this.settings.getSettings()
    return settings.enabled && Boolean(settings.apiUrl && settings.clientId && settings.clientSecret)
  }

  /** Vytvoří zásilku v DPD pro dané objednávky. Soft-degrade při nenastavení. */
  async createShipment(input: DpdCreateShipmentInput): Promise<DpdCreateShipmentResult> {
    const configured = await this.isConfigured()
    if (!configured) {
      this.logger.debug(`DPD не налаштовано — пропуск створення відправлення ${input.orderId}.`)
      return { ok: false, message: 'DPD не налаштовано.' }
    }
    this.logger.warn(`DPD createShipment(${input.orderId}) — stub, зовнішній запит не виконано.`)
    return { ok: false, message: 'Створення відправлення DPD ще не реалізовано (stub).' }
  }

  /** Vrátí PDF štítek pro danou zásilku. Soft-degrade při nenastavení. */
  async getLabel(shipmentId: string): Promise<DpdLabelResult> {
    const configured = await this.isConfigured()
    if (!configured) {
      return { ok: false, message: 'DPD не налаштовано.' }
    }
    this.logger.warn(`DPD getLabel(${shipmentId}) — stub, PDF-етикетку не отримано.`)
    return { ok: false, message: 'Отримання етикетки DPD ще не реалізовано (stub).' }
  }

  /** Стан відправлення DPD за трек-номером. Soft-degrade при ненастановленні. */
  async trackShipment(trackingNumber: string): Promise<DpdTrackingResult> {
    const configured = await this.isConfigured()
    if (!configured) {
      return { ok: false, message: 'DPD не налаштовано.' }
    }
    this.logger.warn(`DPD trackShipment(${trackingNumber}) — stub, статус не отримано.`)
    return { ok: false, message: 'Відстеження DPD ще не реалізовано (stub).' }
  }
}
