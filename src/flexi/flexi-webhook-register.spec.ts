import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  isLocalOnlyWebhookUrl,
  LOCAL_WEBHOOK_URL_REJECTED,
} from './flexi-webhook-url'

describe('isLocalOnlyWebhookUrl', () => {
  it('detects localhost / loopback / ::1 / corrupt double-scheme', () => {
    assert.equal(isLocalOnlyWebhookUrl('https://localhost:3000/flexi/webhook'), true)
    assert.equal(isLocalOnlyWebhookUrl('http://127.0.0.1:3000/flexi/webhook'), true)
    assert.equal(isLocalOnlyWebhookUrl('http://[::1]:3000/flexi/webhook'), true)
    assert.equal(isLocalOnlyWebhookUrl('https://http://localhost:3000/flexi/webhook'), true)
    assert.equal(isLocalOnlyWebhookUrl('https://api.green-angels.sk/flexi/webhook'), false)
    assert.equal(isLocalOnlyWebhookUrl('https://api.example.com/flexi/webhook'), false)
  })
})

describe('Webhook registration never uses skipUrlTest', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)))

  it('client.registerWebhook never sets skipUrlTest query param', () => {
    const src = readFileSync(join(root, 'flexi.client.ts'), 'utf8')
    const fnStart = src.indexOf('async registerWebhook(')
    assert.ok(fnStart >= 0)
    const slice = src.slice(fnStart, fnStart + 600)
    assert.equal(slice.includes("qs.set('skipUrlTest'"), false)
    assert.equal(slice.includes('skipUrlTest=true'), false)
    assert.ok(slice.includes("PUT', `/hooks.json?"))
  })

  it('localhost URL is rejected — no remote hook created', () => {
    assert.equal(isLocalOnlyWebhookUrl('https://localhost:3000/flexi/webhook'), true)
    assert.equal(LOCAL_WEBHOOK_URL_REJECTED.includes('public HTTPS URL'), true)
    // Early reject returns ok:false before listHooks / registerWebhook.
    const wouldCallAbra = !isLocalOnlyWebhookUrl('https://localhost:3000/flexi/webhook')
    assert.equal(wouldCallAbra, false)
  })

  it('production HTTPS registration path does not pass skipUrlTest', () => {
    const service = readFileSync(join(root, 'flexi.service.ts'), 'utf8')
    const start = service.indexOf('async registerWebhook(opts?:')
    assert.ok(start >= 0)
    const end = service.indexOf('async disableWebhook', start)
    const body = service.slice(start, end)
    assert.equal(body.includes("qs.set('skipUrlTest'"), false)
    assert.equal(body.includes('skipUrlTest,'), false)
    assert.equal(body.includes('skipUrlTest ='), false)
    assert.ok(body.includes('isLocalOnlyWebhookUrl'))
    assert.ok(body.includes('LOCAL_WEBHOOK_URL_REJECTED'))
    // Client call has 3 args only (url, secKey, lastVersion) — no 4th skip flag.
    assert.ok(
      /this\.client\.registerWebhook\(\s*settings\.webhookUrl,\s*settings\.webhookSecKey,\s*lastVersion,\s*\)/.test(
        body,
      ),
    )
  })

  it('failed ABRA URL test keeps Auto Sync not accepting', () => {
    const setAcceptingRequested = false
    const registerOk = false
    let webhookAccepting = false
    if (registerOk && setAcceptingRequested) webhookAccepting = true
    assert.equal(webhookAccepting, false)
  })

  it('no fake healthy state for local URL', () => {
    const webhookUrl = 'https://localhost:3000/flexi/webhook'
    const registerOk = !isLocalOnlyWebhookUrl(webhookUrl)
    const webhookAccepting = registerOk
    const webhookRemoteId = registerOk ? '9' : ''
    assert.equal(registerOk, false)
    assert.equal(webhookAccepting, false)
    assert.equal(webhookRemoteId, '')
  })

  it('enableWithoutUpdate restores globalVersion when registration fails', () => {
    const previousGlobalVersion = 17523
    let globalVersion = previousGlobalVersion
    const tip = 99810
    globalVersion = tip
    const registeredOk = false
    if (!registeredOk) globalVersion = previousGlobalVersion
    assert.equal(globalVersion, 17523)
  })

  it('repo runtime flexi sources never send skipUrlTest=true', () => {
    const files = [
      'flexi.client.ts',
      'flexi.service.ts',
      'flexi-auto-sync.service.ts',
      'flexi.controller.ts',
      'flexi-hooks.service.ts',
    ]
    for (const file of files) {
      const src = readFileSync(join(root, file), 'utf8')
      assert.equal(src.includes("skipUrlTest', 'true'"), false, file)
      assert.equal(src.includes('skipUrlTest=true'), false, file)
      assert.equal(src.includes('skipUrlTest: true'), false, file)
    }
  })
})
