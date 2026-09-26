import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { UpdateCheckoutDraftDto } from './update-checkout-draft.dto'

/** Mirror Nest ValidationPipe: whitelist + forbidNonWhitelisted + transform. */
async function validateDraft(body: unknown) {
  const instance = plainToInstance(UpdateCheckoutDraftDto, body, {
    enableImplicitConversion: false,
  })
  return validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  })
}

describe('UpdateCheckoutDraftDto — runtime 400 contract', () => {
  it('DTO declares optional v (CheckoutDraftV1 version) — source', () => {
    const text = readFileSync(resolve(__dirname, 'update-checkout-draft.dto.ts'), 'utf8')
    assert.match(text, /@IsIn\(\[1\]\)[\s\S]*\bv\?: 1/)
  })

  it('exact failing shop payload with v:1 is accepted', async () => {
    // Captured shape from buildCheckoutDraftPayload / live shop PATCH body that returned 400.
    const payload = {
      v: 1,
      locale: 'sk',
      firstName: 'Jan',
      isOtherRecipient: false,
      deliveryAddressSameAsBilling: true,
      packetaCarrierId: null,
    }
    const errors = await validateDraft(payload)
    assert.equal(errors.length, 0, JSON.stringify(errors))
  })

  it('rejects unknown property (forbidNonWhitelisted still on)', async () => {
    const errors = await validateDraft({
      v: 1,
      firstName: 'Jan',
      clientSecret: 'sec_xxx',
    })
    assert.ok(errors.length > 0)
  })

  it('partial drafts: empty-ish / contact / packeta / payment', async () => {
    const cases = [
      { v: 1 },
      { v: 1, firstName: 'A' },
      { v: 1, email: 'a@b.c' },
      { v: 1, countryCode: 'sk' },
      { v: 1, deliveryMethod: 'packeta-box', packetaPickupKind: 'box', postOffice: '123' },
      { v: 1, billingStreet: 'Main', billingCity: 'Bratislava' },
      { v: 1, buyerType: 'company', companyLegalName: 'ACME s.r.o.', companyEdrpou: '12345678' },
      { v: 1, paymentMethod: 'card-online' },
      {
        v: 1,
        locale: 'sk',
        countryCode: 'at',
        firstName: 'Jan',
        lastName: 'Novak',
        email: 'jan@example.com',
        phone: '+421900000000',
        deliveryMethod: 'packeta-box',
        deliveryCountryCode: 'at',
        packetaPickupKind: 'box',
        postOffice: '10001',
        postOfficeLabel: 'Packeta Wien',
        paymentMethod: 'card-online',
        deliveryAddressSameAsBilling: true,
        isOtherRecipient: false,
        packetaCarrierId: null,
        promoCodes: ['SAVE10'],
      },
    ]
    for (const body of cases) {
      const errors = await validateDraft(body)
      assert.equal(errors.length, 0, `${JSON.stringify(body)} → ${JSON.stringify(errors)}`)
    }
  })

  it('rejects invalid countryCode / buyerType / packetaPickupKind / v', async () => {
    assert.ok((await validateDraft({ v: 1, countryCode: 'ua' })).length > 0)
    assert.ok((await validateDraft({ v: 1, buyerType: 'org' })).length > 0)
    assert.ok((await validateDraft({ v: 1, packetaPickupKind: 'locker' })).length > 0)
    assert.ok((await validateDraft({ v: 2 })).length > 0)
  })
})
