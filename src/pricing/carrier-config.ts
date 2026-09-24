/**
 * Carrier-owned settings helpers (Settings JSON on cart.checkout).
 * Types live in cart-checkout.types.ts to avoid circular imports.
 */

import type {
  CartCheckoutSettings,
  CarrierConfigs,
  CarrierServicePhysicalLimits,
  DeliverySizeLimit,
  PacketaCodAmountTier,
  PacketaCodSettings,
  PacketaCustomerCodFeeBase,
} from '../settings/cart-checkout.types'
import { carrierRateLookupKeys, customerShippingRateLookupKeys } from './carrier-rate-lookup'
import { DEFAULT_DELIVERY_SIZE_LIMITS } from '../settings/cart-checkout.types'
import { roundMoney } from './pricing.helpers'

export type CarrierId = 'packeta' | 'gls' | 'novaPoshta'

export function carrierIdFromDeliveryMethod(method: string | undefined): CarrierId | null {
  if (!method) return null
  if (method.startsWith('packeta')) return 'packeta'
  if (method.startsWith('gls')) return 'gls'
  if (method.startsWith('nova-poshta')) return 'novaPoshta'
  return null
}

/**
 * Per-carrier tariff NET/GROSS with fallback to legacy global flag (default true).
 */
export function resolveCarrierTariffAmountsAreNet(
  settings: Pick<CartCheckoutSettings, 'carrierTariffAmountsAreNet' | 'carrierConfigs'>,
  method: string | undefined,
): boolean {
  const carrier = carrierIdFromDeliveryMethod(method)
  if (carrier) {
    const own = settings.carrierConfigs?.[carrier]?.tariffAmountsAreNet
    if (typeof own === 'boolean') return own
  }
  return settings.carrierTariffAmountsAreNet !== false
}

/** Project carrierConfigs.*.services size limits into cartSize.limits for filterDeliveryMethodsBySize. */
export function projectCarrierConfigsToCartSizeLimits(
  configs: CarrierConfigs | undefined,
  existing: DeliverySizeLimit[] | undefined,
): DeliverySizeLimit[] {
  const byMethod = new Map<string, DeliverySizeLimit>()
  for (const row of existing?.length ? existing : DEFAULT_DELIVERY_SIZE_LIMITS) {
    byMethod.set(row.method, { ...row })
  }

  const apply = (method: string, svc: CarrierServicePhysicalLimits | undefined) => {
    if (!svc) return
    const prev = byMethod.get(method)
    byMethod.set(method, {
      method: method as DeliverySizeLimit['method'],
      maxLongestSideCm: svc.maxLongestSideCm ?? prev?.maxLongestSideCm ?? 0,
      maxSideSumCm: svc.maxSideSumCm ?? prev?.maxSideSumCm ?? 0,
      maxGirthCm: svc.maxGirthCm ?? prev?.maxGirthCm ?? 0,
    })
  }

  for (const [method, svc] of Object.entries(configs?.packeta?.services ?? {})) {
    apply(method, svc)
  }
  for (const [method, svc] of Object.entries(configs?.gls?.services ?? {})) {
    apply(method, svc)
  }
  for (const [method, svc] of Object.entries(configs?.novaPoshta?.services ?? {})) {
    apply(method, svc)
  }

  return [...byMethod.values()]
}

function pickTierFee(tiers: PacketaCodAmountTier[], base: number): number {
  const sorted = [...tiers].sort((a, b) => a.fromAmount - b.fromAmount)
  const tier = sorted.find((t) => {
    if (base < t.fromAmount) return false
    if (t.toAmount == null) return true
    return base <= t.toAmount
  })
  return tier ? Math.max(0, tier.fee) : 0
}

function resolveCustomerFeeBaseAmount(
  feeBase: PacketaCustomerCodFeeBase,
  input: {
    productsSubtotal: number
    /** Deterministic pre-COD total (products + delivery + packaging). */
    grandTotalBeforeCod: number
  },
): number {
  if (feeBase === 'products_subtotal') return input.productsSubtotal
  // cod_collected: same as grand_total_before_cod — never recurse through customer COD fee.
  return input.grandTotalBeforeCod
}

/**
 * C — Customer COD fee for Packeta + dobierka.
 * Returns null when Packeta customerPrice is not configured → caller uses legacy cart.codFee*.
 */
export function resolvePacketaCustomerCodFee(
  settings: Pick<CartCheckoutSettings, 'carrierConfigs'>,
  input: {
    paymentMethod?: string
    deliveryMethod?: string
    productsSubtotal: number
    grandTotalBeforeCod: number
  },
): { fee: number; feeAmountsAreNet: boolean; overMax: boolean } | null {
  if (input.paymentMethod !== 'dobierka') return null
  if (!input.deliveryMethod?.startsWith('packeta')) return null

  const cod = settings.carrierConfigs?.packeta?.cod as PacketaCodSettings | undefined
  const customer = cod?.customerPrice
  if (!customer || customer.mode === 'none') return null

  const base = resolveCustomerFeeBaseAmount(customer.feeBase, {
    productsSubtotal: input.productsSubtotal,
    grandTotalBeforeCod: input.grandTotalBeforeCod,
  })

  if (customer.maxAmount != null && customer.maxAmount > 0 && base > customer.maxAmount) {
    return { fee: 0, feeAmountsAreNet: customer.feeAmountsAreNet, overMax: true }
  }

  if (customer.mode === 'fixed') {
    if (!(customer.fixedAmount > 0)) return null
    return {
      fee: Math.max(0, customer.fixedAmount),
      feeAmountsAreNet: customer.feeAmountsAreNet,
      overMax: false,
    }
  }

  // tiers
  if (!customer.tiers.length) return null
  return {
    fee: pickTierFee(customer.tiers, base),
    feeAmountsAreNet: customer.feeAmountsAreNet,
    overMax: false,
  }
}

/**
 * @deprecated Prefer resolvePacketaCustomerCodFee. Kept as thin wrapper for older call sites.
 */
export function resolvePacketaCodFee(
  settings: Pick<CartCheckoutSettings, 'carrierConfigs'>,
  input: {
    paymentMethod?: string
    deliveryMethod?: string
    productsSubtotal: number
    codCollectedAmount?: number
    grandTotalBeforeCod?: number
  },
): { fee: number; usedPacketaTiers: boolean; feeAmountsAreNet: boolean } | null {
  const preCod =
    input.grandTotalBeforeCod ??
    input.codCollectedAmount ??
    input.productsSubtotal
  const resolved = resolvePacketaCustomerCodFee(settings, {
    paymentMethod: input.paymentMethod,
    deliveryMethod: input.deliveryMethod,
    productsSubtotal: input.productsSubtotal,
    grandTotalBeforeCod: preCod,
  })
  if (!resolved) return null
  if (resolved.overMax) {
    return { fee: -1, usedPacketaTiers: true, feeAmountsAreNet: resolved.feeAmountsAreNet }
  }
  return {
    fee: resolved.fee,
    usedPacketaTiers: true,
    feeAmountsAreNet: resolved.feeAmountsAreNet,
  }
}

/**
 * Resolve Packeta service-specific COD rules.
 *
 * Customer-facing supportsCod / maxAmount: method:CC → method only (ignores serviceKey)
 * so later BDS/carrier fulfilment cannot change customer COD eligibility/fee base.
 *
 * Internal carrierCost (A): still may walk serviceKey keys when provided — for
 * shipping-day cost accounting only; never added to customer totals.
 */
export function resolvePacketaServiceCodRules(
  settings: Pick<CartCheckoutSettings, 'carrierConfigs'>,
  input: {
    deliveryMethod?: string
    countryCode?: string | null
    serviceKey?: string | null
    /** When true (default), ignore serviceKey for supportsCod/max (customer path). */
    customerFacing?: boolean
  },
): {
  supportsCod: boolean
  maxAmount: number | null
  carrierCost: PacketaCodSettings['carrierCost'] | null
} {
  const method = input.deliveryMethod?.trim() ?? ''
  const cod = settings.carrierConfigs?.packeta?.cod
  if (!method.startsWith('packeta') || !cod) {
    return { supportsCod: true, maxAmount: null, carrierCost: cod?.carrierCost ?? null }
  }

  const customerFacing = input.customerFacing !== false
  const by = cod.byService ?? {}
  const keys = customerFacing
    ? customerShippingRateLookupKeys(method, input.countryCode)
    : carrierRateLookupKeys(method, input.countryCode, input.serviceKey)

  for (const key of keys) {
    const entry = by[key]
    if (entry) {
      return {
        supportsCod: entry.supportsCod !== false,
        maxAmount: entry.maxAmount,
        carrierCost: entry.carrierCost?.enabled ? entry.carrierCost : null,
      }
    }
  }

  return {
    supportsCod: true,
    maxAmount: null,
    carrierCost: cod.carrierCost?.enabled ? cod.carrierCost : null,
  }
}

/**
 * A — Internal Packeta COD carrier cost (contract tiers on COD amount).
 * Never added to customer totals. Prefers byService when configured.
 */
export function resolvePacketaCarrierCodCost(
  settings: Pick<CartCheckoutSettings, 'carrierConfigs'>,
  codAmount: number,
  opts?: {
    deliveryMethod?: string
    countryCode?: string | null
    serviceKey?: string | null
  },
): { fee: number; amountsAreNet: boolean } | null {
  const rules = resolvePacketaServiceCodRules(settings, {
    deliveryMethod: opts?.deliveryMethod,
    countryCode: opts?.countryCode,
    serviceKey: opts?.serviceKey,
    customerFacing: false,
  })
  const carrier = rules.carrierCost
  if (!carrier?.enabled || !carrier.tiers.length) return null
  return {
    fee: pickTierFee(carrier.tiers, Math.max(0, codAmount)),
    amountsAreNet: carrier.amountsAreNet !== false,
  }
}

/**
 * B — Internal Packeta card-on-COD sender cost.
 * Never added to customer totals / Order.codFeeAmount.
 */
export function resolvePacketaCardOnCodSenderCost(
  settings: Pick<CartCheckoutSettings, 'carrierConfigs'>,
  codAmountIncludingVat: number,
): number {
  const card = settings.carrierConfigs?.packeta?.cod?.cardOnCod
  if (!card?.enabled || !(card.percent > 0)) return 0
  if (card.affectsCustomerTotal !== false) return 0
  return roundMoney((Math.max(0, codAmountIncludingVat) * card.percent) / 100)
}
