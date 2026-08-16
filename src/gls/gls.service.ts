import { Injectable, Logger } from '@nestjs/common'

import { GlsSettingsService } from './gls.settings.service'
import type {
  GlsCreateShipmentInput,
  GlsCreateShipmentResult,
  GlsLabelResult,
} from './gls.types'

/** GLS MyGLS SK — settings + soft-degrade shipment stubs until full SOAP/REST wiring. */
@Injectable()
export class GlsService {
  private readonly logger = new Logger(GlsService.name)

  constructor(private readonly settings: GlsSettingsService) {}

  async isConfigured(): Promise<boolean> {
    const settings = await this.settings.getSettings()
    return (
      settings.enabled &&
      Boolean(settings.apiUrl && settings.username && settings.password && settings.clientNumber)
    )
  }

  async createShipment(input: GlsCreateShipmentInput): Promise<GlsCreateShipmentResult> {
    const configured = await this.isConfigured()
    if (!configured) {
      return { ok: false, message: 'GLS не налаштовано.' }
    }
    this.logger.warn(`GLS createShipment(${input.orderId}) — ще не підключено.`)
    return { ok: false, message: 'Створення відправлення GLS ще не реалізовано.' }
  }

  async getLabel(shipmentId: string): Promise<GlsLabelResult> {
    const configured = await this.isConfigured()
    if (!configured) {
      return { ok: false, message: 'GLS не налаштовано.' }
    }
    this.logger.warn(`GLS getLabel(${shipmentId}) — ще не підключено.`)
    return { ok: false, message: 'Отримання етикетки GLS ще не реалізовано.' }
  }
}
