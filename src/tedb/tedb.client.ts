import { Injectable, Logger } from '@nestjs/common'

import { TEDB_MEMBER_STATES } from './tedb.constants'

export type TedbVatRateRow = {
  memberState: string
  rateType: 'standard' | 'reduced'
  percent: number
  cnCodes: string[]
  category?: string | null
}

/**
 * EU TEDB VatRetrievalService (SOAP).
 * Soft-degrades: returns [] on network/parse failure (caller keeps seed/manual).
 *
 * @see https://ec.europa.eu/taxation_customs/tedb/ws/VatRetrievalService.wsdl
 * @see https://taxation-customs.ec.europa.eu/system/files/2023-06/SDEV-TEDB-SSD-VatRetrievalService-v1.10-Public.pdf
 */
@Injectable()
export class TedbClient {
  private readonly logger = new Logger(TedbClient.name)

  /** soap:address from WSDL (use HTTPS + trailing slash). */
  private readonly endpoint = 'https://ec.europa.eu/taxation_customs/tedb/ws/'

  private readonly soapAction =
    'urn:ec.europa.eu:taxud:tedb:services:v1:VatRetrievalService/RetrieveVatRates'

  async retrieveVatRates(memberStates: string[] = [...TEDB_MEMBER_STATES]): Promise<TedbVatRateRow[]> {
    const day = new Date().toISOString().slice(0, 10)
    const statesXml = memberStates
      .map((iso) => `<types:isoCode>${iso.toUpperCase()}</types:isoCode>`)
      .join('')

    // Message NS = IVatRetrievalService; nested fields = :types (elementFormDefault=qualified).
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:urn="urn:ec.europa.eu:taxud:tedb:services:v1:IVatRetrievalService"
  xmlns:types="urn:ec.europa.eu:taxud:tedb:services:v1:IVatRetrievalService:types">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:retrieveVatRatesReqMsg>
      <types:memberStates>${statesXml}</types:memberStates>
      <types:from>${day}</types:from>
      <types:to>${day}</types:to>
    </urn:retrieveVatRatesReqMsg>
  </soapenv:Body>
</soapenv:Envelope>`

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: this.soapAction,
        },
        body,
        signal: AbortSignal.timeout(45_000),
      })
      const text = await res.text()
      if (!res.ok) {
        this.logger.warn(`TEDB HTTP ${res.status}: ${text.slice(0, 240)}`)
        return []
      }
      if (/faultstring|retrieveVatRatesFaultMsg/i.test(text)) {
        this.logger.warn(`TEDB SOAP fault: ${text.slice(0, 400)}`)
        return []
      }
      const rows = this.parseSoapResponse(text)
      this.logger.log(`TEDB parsed ${rows.length} rate rows for ${memberStates.join(',')}`)
      return rows
    } catch (error) {
      this.logger.warn(
        `TEDB request failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return []
    }
  }

  private parseSoapResponse(xml: string): TedbVatRateRow[] {
    const rows: TedbVatRateRow[] = []
    // Split on opening vatRateResults (with or without namespace prefix).
    const resultBlocks = xml.split(/<(?:[\w.]+:)?vatRateResults\b[^>]*>/i).slice(1)

    for (const raw of resultBlocks) {
      const block = raw.split(/<\/(?:[\w.]+:)?vatRateResults>/i)[0] ?? raw
      const memberState = this.tagText(block, 'memberState')
      const typeRaw = (this.tagText(block, 'type') || '').toUpperCase()
      if (!memberState || !typeRaw) continue

      // Nested <rate><type>…</type><value>23.0</value></rate>
      const rateBlock = this.innerBlock(block, 'rate')
      const percent = Number(rateBlock ? this.tagText(rateBlock, 'value') : NaN)
      if (!Number.isFinite(percent)) continue

      const rateType: 'standard' | 'reduced' = typeRaw.includes('REDUCED')
        ? 'reduced'
        : 'standard'

      const cnCodes = [
        ...block.matchAll(
          /<(?:[\w.]+:)?code\b[^>]*>[\s\S]*?<(?:[\w.]+:)?value\b[^>]*>([^<]+)<\/(?:[\w.]+:)?value>/gi,
        ),
      ]
        .map((m) => m[1]!.replace(/\s+/g, '').trim())
        .filter(Boolean)

      const category = this.tagText(this.innerBlock(block, 'category') ?? '', 'identifier')

      rows.push({
        memberState: memberState.toUpperCase(),
        rateType,
        percent,
        cnCodes,
        category,
      })
    }

    return rows
  }

  private innerBlock(xml: string, localName: string): string | null {
    const re = new RegExp(
      `<(?:[\\w.]+:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.]+:)?${localName}>`,
      'i',
    )
    const m = xml.match(re)
    return m?.[1] ?? null
  }

  private tagText(xml: string, localName: string): string | null {
    if (!xml) return null
    const re = new RegExp(`<(?:[\\w.]+:)?${localName}\\b[^>]*>([^<]*)<\\/(?:[\\w.]+:)?${localName}>`, 'i')
    const m = xml.match(re)
    return m?.[1]?.trim() || null
  }
}
