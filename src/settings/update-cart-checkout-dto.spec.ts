/**
 * Pre-deploy DTO fix regression: carrierConfigs / packagingStrategy must pass
 * ValidationPipe (whitelist + forbidNonWhitelisted) and survive update merge.
 */
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { UpdateCartCheckoutSettingsDto } from './dto/update-cart-checkout-settings.dto'
import { normalizeCartCheckoutSettings } from './cart-checkout.normalize'
import { DEFAULT_CART_CHECKOUT_SETTINGS } from './cart-checkout.types'
import type { CartCheckoutSettings } from './cart-checkout.types'

/** Mirror Nest ValidationPipe: whitelist + forbidNonWhitelisted. */
async function validateCartCheckoutDto(plain: unknown) {
  const instance = plainToInstance(UpdateCartCheckoutSettingsDto, plain, {
    enableImplicitConversion: true,
  })
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  })
  return { instance, errors }
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const result = { ...base }
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = patch[key]
    if (value === undefined) continue
    const current = base[key]
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      result[key] = deepMerge(
        current as Record<string, unknown>,
        value as Record<string, unknown>,
      ) as T[keyof T]
    } else {
      result[key] = value as T[keyof T]
    }
  }
  return result
}

/** Simulate settings.updateCartCheckout after DTO validation. */
function applyValidatedPatch(
  current: CartCheckoutSettings,
  dto: UpdateCartCheckoutSettingsDto,
): CartCheckoutSettings {
  return normalizeCartCheckoutSettings(
    deepMerge(
      current as unknown as Record<string, unknown>,
      dto as unknown as Record<string, unknown>,
    ) as CartCheckoutSettings,
  )
}

/** OLD production-shaped fixture (no serviceIdentity). Sentinel amounts. */
function oldProductionPacketaFixture(): Partial<CartCheckoutSettings> {
  return {
    deliveryMode: 'carrier_rates',
    carrierTariffAmountsAreNet: true,
    packagingAmountsAreNet: true,
    standardParcelMaxWeightKg: 15,
    defaultMissingWeightKg: 1.11,
    packagingStrategy: {
      mode: 'box',
      pallet: {
        enabled: false,
        unitPrice: 9.99,
        capacityByContainerSlug: { '10l': 4 },
        autoPricingEnabled: false,
      },
    },
    carrierRateTables: {
      'packeta-box': [{ maxWeightKg: 15, amount: 11.11 }],
      'packeta-box:SK': [{ maxWeightKg: 15, amount: 22.22 }],
      'packeta-box:CZ': [{ maxWeightKg: 15, amount: 33.33 }],
      'packeta-box:HU': [{ maxWeightKg: 15, amount: 44.44 }],
      'packeta-courier': [{ maxWeightKg: 15, amount: 55.55 }],
      'packeta-courier:SK': [{ maxWeightKg: 15, amount: 66.66 }],
      'packeta-courier:CZ': [{ maxWeightKg: 15, amount: 77.77 }],
      'packeta-courier:HU': [{ maxWeightKg: 15, amount: 88.88 }],
      'packeta-courier:AT': [{ maxWeightKg: 15, amount: 99.99 }],
      'packeta-courier:DE': [{ maxWeightKg: 15, amount: 12.12 }],
    },
    carrierSurcharges: {
      'packeta-box:SK': {
        fuelPercent: 18.5,
        fuelMode: 'separate',
        tollPerStartedKgNet: 0.04,
        tollMode: 'separate',
        maxParcelWeightKg: 15,
        insurance: {
          enabled: true,
          maxDeclaredValue: 500,
          tiers: [
            { upTo: 100, fee: 1.23 },
            { upTo: 500, fee: 4.56 },
          ],
        },
        nonDepot: { amount: 7.77, automaticCalculation: false },
      },
      'packeta-courier:AT': {
        fuelPercent: 10,
        fuelMode: 'included',
        tollPerStartedKgNet: 0.5,
        tollMode: 'separate',
        maxParcelWeightKg: 15,
        insurance: { enabled: false, maxDeclaredValue: null, tiers: [] },
        nonDepot: { amount: 0, automaticCalculation: false },
      },
    },
    carrierConfigs: {
      packeta: {
        tariffAmountsAreNet: true,
        services: {
          'packeta-box': {
            maxLongestSideCm: 111,
            maxSideSumCm: 222,
            maxGirthCm: 0,
            supportsBoxes: true,
            supportsPallets: false,
          },
          'packeta-courier': {
            maxLongestSideCm: 333,
            maxSideSumCm: 444,
            maxGirthCm: 0,
            supportsBoxes: true,
            supportsPallets: false,
          },
        },
        cod: {
          carrierCost: {
            enabled: true,
            basis: 'COD_AMOUNT',
            amountsAreNet: true,
            tiers: [
              { fromAmount: 0, toAmount: 100, fee: 2.22 },
              { fromAmount: 100, toAmount: null, fee: 3.33 },
            ],
          },
          cardOnCod: {
            enabled: true,
            percent: 1.5,
            basis: 'COD_AMOUNT_INCLUDING_VAT',
            chargedTo: 'SENDER',
            affectsCustomerTotal: false,
          },
          customerPrice: {
            mode: 'fixed',
            maxAmount: 999,
            feeBase: 'products_subtotal',
            feeAmountsAreNet: true,
            fixedAmount: 1.2,
            tiers: [],
          },
          byService: {
            'packeta-courier:AT': {
              supportsCod: true,
              maxAmount: 400,
              carrierCost: {
                enabled: true,
                basis: 'COD_AMOUNT',
                amountsAreNet: true,
                tiers: [{ fromAmount: 0, toAmount: null, fee: 5.55 }],
              },
            },
          },
        },
      },
      gls: {
        tariffAmountsAreNet: true,
        services: {
          'gls-courier': {
            maxLongestSideCm: 50,
            maxSideSumCm: 100,
            maxGirthCm: 0,
            supportsBoxes: true,
            supportsPallets: false,
          },
        },
      },
    },
    cartSize: {
      enabled: true,
      limits: [
        {
          method: 'packeta-box',
          maxLongestSideCm: 111,
          maxSideSumCm: 222,
          maxGirthCm: 0,
        },
        {
          method: 'packeta-courier',
          maxLongestSideCm: 333,
          maxSideSumCm: 444,
          maxGirthCm: 0,
        },
      ],
    },
  }
}

function buildPacketaRateTablesPatch(
  tables: CartCheckoutSettings['carrierRateTables'] | undefined,
) {
  const PACKETA_COUNTRIES = ['SK', 'CZ', 'AT', 'DE', 'HU'] as const
  const PACKETA_SERVICES = [
    { method: 'packeta-box', countries: ['SK', 'CZ', 'HU'] },
    { method: 'packeta-courier', countries: ['SK', 'CZ', 'AT', 'DE', 'HU'] },
  ]
  const out: NonNullable<CartCheckoutSettings['carrierRateTables']> = {
    ...(tables ?? {}),
  }
  for (const country of PACKETA_COUNTRIES) {
    for (const service of PACKETA_SERVICES) {
      if (!service.countries.includes(country)) continue
      const key = `${service.method}:${country}`
      if (!(key in out)) out[key] = []
    }
  }
  return out
}

describe('UpdateCartCheckoutSettingsDto — Packeta pre-deploy fix', () => {
  it('rejects unknown top-level property (ValidationPipe safety)', async () => {
    const { errors } = await validateCartCheckoutDto({
      showDelivery: true,
      totallyUnknownSetting: true,
    })
    assert.ok(errors.length > 0)
    const flat = JSON.stringify(errors)
    assert.match(flat, /totallyUnknownSetting|whitelist|property/i)
  })

  it('accepts Packeta Backoffice-shaped payload with carrierConfigs', async () => {
    const current = normalizeCartCheckoutSettings({
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      ...oldProductionPacketaFixture(),
    })
    const packetaPayload = {
      defaultMissingWeightKg: current.defaultMissingWeightKg,
      standardParcelMaxWeightKg: current.standardParcelMaxWeightKg,
      carrierTariffAmountsAreNet: current.carrierTariffAmountsAreNet !== false,
      carrierConfigs: current.carrierConfigs ?? {},
      cartSize: current.cartSize,
      carrierRateTables: buildPacketaRateTablesPatch(current.carrierRateTables),
      carrierSurcharges: { ...(current.carrierSurcharges ?? {}) },
    }
    const { instance, errors } = await validateCartCheckoutDto(packetaPayload)
    assert.equal(errors.length, 0, JSON.stringify(errors, null, 2))
    assert.ok(instance.carrierConfigs)
    assert.ok(instance.carrierRateTables)
  })

  it('accepts Cart form packagingStrategy', async () => {
    const { instance, errors } = await validateCartCheckoutDto({
      packagingMode: 'pallet',
      packagingStrategy: {
        mode: 'pallet',
        pallet: {
          enabled: true,
          unitPrice: 12.34,
          capacityByContainerSlug: { '20l': 2 },
          autoPricingEnabled: true,
        },
      },
    })
    assert.equal(errors.length, 0, JSON.stringify(errors, null, 2))
    assert.equal(instance.packagingStrategy?.mode, 'pallet')
    assert.equal(instance.packagingStrategy?.pallet?.unitPrice, 12.34)
  })

  it('OLD production settings round-trip via DTO → merge → normalize', async () => {
    const loaded = normalizeCartCheckoutSettings({
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      ...oldProductionPacketaFixture(),
    })

    // Packeta form first-save payload (no intentional edits)
    const packetaPayload = {
      defaultMissingWeightKg: loaded.defaultMissingWeightKg,
      standardParcelMaxWeightKg: loaded.standardParcelMaxWeightKg,
      carrierTariffAmountsAreNet: loaded.carrierTariffAmountsAreNet !== false,
      carrierConfigs: loaded.carrierConfigs ?? {},
      cartSize: loaded.cartSize,
      carrierRateTables: buildPacketaRateTablesPatch(loaded.carrierRateTables),
      carrierSurcharges: { ...(loaded.carrierSurcharges ?? {}) },
    }

    const { instance, errors } = await validateCartCheckoutDto(packetaPayload)
    assert.equal(errors.length, 0, JSON.stringify(errors, null, 2))

    const after = applyValidatedPatch(loaded, instance)

    const rateKeys = [
      'packeta-box',
      'packeta-box:SK',
      'packeta-box:CZ',
      'packeta-box:HU',
      'packeta-courier',
      'packeta-courier:SK',
      'packeta-courier:CZ',
      'packeta-courier:HU',
      'packeta-courier:AT',
      'packeta-courier:DE',
    ] as const
    for (const key of rateKeys) {
      assert.equal(
        after.carrierRateTables?.[key]?.[0]?.amount,
        loaded.carrierRateTables?.[key]?.[0]?.amount,
        `rate lost: ${key}`,
      )
    }

    assert.equal(
      after.carrierSurcharges?.['packeta-box:SK']?.fuelPercent,
      18.5,
    )
    assert.equal(
      after.carrierSurcharges?.['packeta-box:SK']?.insurance?.tiers?.[0]?.fee,
      1.23,
    )
    assert.equal(
      after.carrierSurcharges?.['packeta-box:SK']?.nonDepot?.amount,
      7.77,
    )
    assert.equal(
      after.carrierConfigs?.packeta?.cod?.customerPrice?.fixedAmount,
      1.2,
    )
    assert.equal(
      after.carrierConfigs?.packeta?.cod?.carrierCost?.tiers?.[0]?.fee,
      2.22,
    )
    assert.equal(after.carrierConfigs?.packeta?.cod?.cardOnCod?.percent, 1.5)
    assert.equal(
      after.carrierConfigs?.packeta?.cod?.byService?.['packeta-courier:AT']
        ?.carrierCost?.tiers?.[0]?.fee,
      5.55,
    )
    assert.equal(
      after.carrierConfigs?.packeta?.services?.['packeta-box']?.maxLongestSideCm,
      111,
    )
    assert.equal(after.carrierConfigs?.packeta?.tariffAmountsAreNet, true)
    assert.equal(after.carrierTariffAmountsAreNet, true)

    // Empty serviceIdentity may be materialized
    assert.ok(after.carrierConfigs?.packeta?.serviceIdentity)
    assert.deepEqual(after.carrierConfigs?.packeta?.serviceIdentity?.catalog, [])
  })

  it('NEW serviceIdentity round-trip preserves catalog and maps', async () => {
    const withIdentity = normalizeCartCheckoutSettings({
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      ...oldProductionPacketaFixture(),
      carrierConfigs: {
        ...oldProductionPacketaFixture().carrierConfigs,
        packeta: {
          ...oldProductionPacketaFixture().carrierConfigs!.packeta!,
          serviceIdentity: {
            catalog: [
              {
                serviceKey: 'dummy-post-hd',
                label: 'Dummy Post HD',
                customerMethod: 'packeta-courier',
                countryCode: 'AT',
                enabled: true,
              },
            ],
            courierDefaultServiceByCountry: { AT: 'dummy-post-hd' },
            boxDefaultServiceByCountry: {
              SK: { box: 'dummy-zbox', branch: 'dummy-zpoint' },
            },
            boxKindDefaultServiceKey: { box: 'dummy-zbox' },
          },
        },
      },
    })

    // Ensure dummy catalog entries that need to exist for maps to stick
    const identity = withIdentity.carrierConfigs!.packeta!.serviceIdentity!
    // Normalize may drop map entries whose serviceKey is not in catalog with matching method/country
    // Our catalog only has courier AT — box maps referencing missing catalog keys may be kept as raw maps
    assert.equal(identity.catalog[0]?.serviceKey, 'dummy-post-hd')
    assert.equal(identity.courierDefaultServiceByCountry.AT, 'dummy-post-hd')

    const payload = {
      carrierConfigs: withIdentity.carrierConfigs,
      carrierTariffAmountsAreNet: true,
    }
    const { instance, errors } = await validateCartCheckoutDto(payload)
    assert.equal(errors.length, 0, JSON.stringify(errors, null, 2))

    const after = applyValidatedPatch(withIdentity, instance)
    const afterId = after.carrierConfigs?.packeta?.serviceIdentity
    assert.equal(afterId?.catalog[0]?.serviceKey, 'dummy-post-hd')
    assert.equal(afterId?.catalog[0]?.label, 'Dummy Post HD')
    assert.equal(afterId?.courierDefaultServiceByCountry.AT, 'dummy-post-hd')
    // method:CC tariffs still present
    assert.equal(after.carrierRateTables?.['packeta-courier:AT']?.[0]?.amount, 99.99)
  })

  it('Cart-owned-only patch preserves independent Packeta B (stale-tab regression)', async () => {
    const packetaB = {
      tariffAmountsAreNet: false as const,
      cod: {
        carrierCost: {
          enabled: true,
          basis: 'COD_AMOUNT' as const,
          amountsAreNet: true,
          tiers: [{ fromAmount: 0, toAmount: null, fee: 3 }],
        },
        cardOnCod: {
          enabled: false,
          percent: 0,
          basis: 'COD_AMOUNT_INCLUDING_VAT' as const,
          chargedTo: 'SENDER' as const,
          affectsCustomerTotal: false as const,
        },
        customerPrice: {
          mode: 'fixed' as const,
          maxAmount: null,
          feeBase: 'products_subtotal' as const,
          feeAmountsAreNet: true,
          fixedAmount: 4.5,
          tiers: [],
        },
      },
      serviceIdentity: {
        catalog: [
          {
            serviceKey: 'svc-b',
            label: 'B',
            customerMethod: 'packeta-courier' as const,
            countryCode: 'SK',
            enabled: true,
          },
        ],
        courierDefaultServiceByCountry: { SK: 'svc-b' },
        boxDefaultServiceByCountry: {},
        boxKindDefaultServiceKey: {},
      },
    }

    const serverB = normalizeCartCheckoutSettings({
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      ...oldProductionPacketaFixture(),
      packagingMode: 'boxes',
      boxUnitPrice: 1,
      carrierConfigs: {
        ...oldProductionPacketaFixture().carrierConfigs,
        packeta: {
          ...oldProductionPacketaFixture().carrierConfigs!.packeta!,
          ...packetaB,
        },
        gls: {
          tariffAmountsAreNet: true,
          services: { 'gls-courier': { maxGirthCm: 300 } },
        },
      },
      carrierRateTables: {
        ...oldProductionPacketaFixture().carrierRateTables,
        'packeta-box:SK': [{ maxWeightKg: 5, amount: 88.88 }],
      },
      carrierSurcharges: {
        ...oldProductionPacketaFixture().carrierSurcharges,
        'packeta-box:SK': {
          ...oldProductionPacketaFixture().carrierSurcharges!['packeta-box:SK']!,
          fuelPercent: 22,
          maxParcelWeightKg: 11,
        },
      },
    })

    // Cart-owned keys only (mirrors shop buildCartOwnedCheckoutPatch)
    const cartOwnedPayload = {
      showDelivery: true,
      packagingMode: 'boxes' as const,
      boxUnitPrice: 2.5,
      packagingAmountsAreNet: true,
      defaultMissingWeightKg: 1.25,
      enabledDeliveryMethods: serverB.enabledDeliveryMethods,
      enabledPaymentMethods: serverB.enabledPaymentMethods,
      cartWeight: serverB.cartWeight,
      packagingStrategy: serverB.packagingStrategy,
      minOrderAmount: serverB.minOrderAmount,
    }

    const { instance, errors } = await validateCartCheckoutDto(cartOwnedPayload)
    assert.equal(errors.length, 0, JSON.stringify(errors, null, 2))
    assert.equal(instance.carrierConfigs, undefined)
    assert.equal(instance.carrierRateTables, undefined)
    assert.equal(instance.carrierSurcharges, undefined)

    const after = applyValidatedPatch(serverB, instance)
    assert.equal(after.boxUnitPrice, 2.5)
    assert.equal(after.defaultMissingWeightKg, 1.25)
    assert.equal(after.carrierConfigs?.packeta?.cod?.customerPrice?.fixedAmount, 4.5)
    assert.equal(
      after.carrierConfigs?.packeta?.serviceIdentity?.catalog?.[0]?.serviceKey,
      'svc-b',
    )
    assert.equal(after.carrierRateTables?.['packeta-box:SK']?.[0]?.amount, 88.88)
    assert.equal(after.carrierSurcharges?.['packeta-box:SK']?.fuelPercent, 22)
    assert.equal(after.carrierSurcharges?.['packeta-box:SK']?.maxParcelWeightKg, 11)
    assert.equal(after.carrierConfigs?.gls?.services?.['gls-courier']?.maxGirthCm, 300)
  })

  it('Packeta-owned patch preserves Cart packaging when omitted', async () => {
    const server = normalizeCartCheckoutSettings({
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      packagingMode: 'pallet',
      boxUnitPrice: 7,
      defaultMissingWeightKg: 2.5,
      packagingStrategy: {
        mode: 'pallet',
        pallet: {
          enabled: true,
          unitPrice: 12,
          capacityByContainerSlug: { '20l': 2 },
          autoPricingEnabled: true,
        },
      },
      carrierConfigs: {
        packeta: { tariffAmountsAreNet: true },
        gls: { tariffAmountsAreNet: false },
      },
    })

    const packetaOwnedPayload = {
      standardParcelMaxWeightKg: 15,
      carrierConfigs: {
        packeta: {
          tariffAmountsAreNet: false,
          cod: {
            carrierCost: {
              enabled: false,
              basis: 'COD_AMOUNT' as const,
              amountsAreNet: true,
              tiers: [],
            },
            cardOnCod: {
              enabled: false,
              percent: 0,
              basis: 'COD_AMOUNT_INCLUDING_VAT' as const,
              chargedTo: 'SENDER' as const,
              affectsCustomerTotal: false as const,
            },
            customerPrice: {
              mode: 'fixed' as const,
              maxAmount: null,
              feeBase: 'products_subtotal' as const,
              feeAmountsAreNet: true,
              fixedAmount: 1.5,
              tiers: [],
            },
          },
        },
      },
      carrierRateTables: {
        'packeta-box:SK': [{ maxWeightKg: 5, amount: 3.3 }],
      },
    }

    const { instance, errors } = await validateCartCheckoutDto(packetaOwnedPayload)
    assert.equal(errors.length, 0, JSON.stringify(errors, null, 2))
    const after = applyValidatedPatch(server, instance)
    assert.equal(after.packagingMode, 'pallet')
    assert.equal(after.boxUnitPrice, 7)
    assert.equal(after.defaultMissingWeightKg, 2.5)
    assert.equal(after.packagingStrategy?.pallet?.unitPrice, 12)
    assert.equal(after.carrierConfigs?.packeta?.tariffAmountsAreNet, false)
    assert.equal(after.carrierConfigs?.gls?.tariffAmountsAreNet, false)
    assert.equal(after.carrierRateTables?.['packeta-box:SK']?.[0]?.amount, 3.3)
  })

  it('Cart form full-object save still validates (DTO accepts full object; UI no longer sends it)', async () => {
    const loaded = normalizeCartCheckoutSettings({
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      ...oldProductionPacketaFixture(),
    })
    const { instance, errors } = await validateCartCheckoutDto(loaded)
    assert.equal(errors.length, 0, JSON.stringify(errors, null, 2))
    assert.ok(instance.carrierConfigs)
    assert.ok(instance.packagingStrategy)
    assert.equal(instance.packagingStrategy?.pallet?.unitPrice, 9.99)
  })
})
