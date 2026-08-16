/**
 * VIES (VAT Information Exchange System) — перевірка чинності номера ІЧ ДПН
 * (IČ DPH / EU VAT number) для B2B-покупців на SK/EU ринку.
 * Фаза C — стаб з коротким Redis-кешем; реальний SOAP-запит до
 * https://ec.europa.eu/taxation_customs/vies/services/checkVatService
 * буде інтегровано пізніше.
 */
export type ViesValidationResult = {
  /** null — перевірку не вдалося виконати (сервіс недоступний/не налаштовано) */
  valid: boolean | null
  countryCode: string
  vatNumber: string
  name?: string | null
  address?: string | null
  message: string
  /** Час перевірки, якщо отримано від VIES (ISO рядок) */
  checkedAt?: string
}
