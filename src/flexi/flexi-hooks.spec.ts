import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DELETE_ALL_ABRA_HOOKS_CONFIRM,
  DELETE_ORPHAN_ABRA_HOOKS_CONFIRM,
  classifyRemoteHook,
  isValidHookId,
  normalizeHookUrl,
} from './flexi-hooks.constants'
import { FlexiHooksService } from './flexi-hooks.service'

type Hook = { id: string; url: string; lastVersion?: number }

function mockClient(initial: Hook[]) {
  let hooks = [...initial]
  return {
    listHooks: async () => [...hooks],
    deleteHook: async (id: string) => {
      const next = hooks.filter((h) => h.id !== id)
      if (next.length === hooks.length) throw new Error(`missing ${id}`)
      hooks = next
    },
    _set: (next: Hook[]) => {
      hooks = [...next]
    },
    _get: () => hooks,
  }
}

describe('flexi-hooks classification helpers', () => {
  it('marks CURRENT only when URL matches configured', () => {
    const configured = 'https://api.green-angels.sk/flexi/webhook'
    assert.equal(
      classifyRemoteHook('https://api.green-angels.sk/flexi/webhook', configured),
      'CURRENT',
    )
    assert.equal(
      classifyRemoteHook('https://localhost:3000/flexi/webhook', configured),
      'OTHER',
    )
    assert.equal(
      classifyRemoteHook('https://http://localhost:3000/flexi/webhook', configured),
      'OTHER',
    )
    assert.equal(classifyRemoteHook(configured, ''), 'OTHER')
  })

  it('normalizes trailing slash for CURRENT match', () => {
    assert.equal(
      normalizeHookUrl('https://api.example.com/flexi/webhook/'),
      'https://api.example.com/flexi/webhook',
    )
    assert.equal(
      classifyRemoteHook(
        'https://api.example.com/flexi/webhook/',
        'https://api.example.com/flexi/webhook',
      ),
      'CURRENT',
    )
  })

  it('validates hook ids', () => {
    assert.equal(isValidHookId('3'), true)
    assert.equal(isValidHookId('5'), true)
    assert.equal(isValidHookId('../x'), false)
    assert.equal(isValidHookId(''), false)
  })
})

describe('FlexiHooksService delete semantics', () => {
  function build(hooks: Hook[], settings: {
    webhookUrl: string
    webhookRemoteId: string
    globalVersion: number
    webhookAccepting?: boolean
  }) {
    const client = mockClient(hooks)
    let remoteId = settings.webhookRemoteId
    let globalVersion = settings.globalVersion
    const settingsSvc = {
      getSettings: async () => ({
        webhookUrl: settings.webhookUrl,
        webhookRemoteId: remoteId,
        globalVersion,
        webhookAccepting: settings.webhookAccepting !== false,
      }),
      updateSettings: async (patch: { webhookRemoteId?: string }) => {
        if (patch.webhookRemoteId !== undefined) remoteId = patch.webhookRemoteId
        return { webhookRemoteId: remoteId, globalVersion }
      },
    }
    const ops = {
      start: async () => ({ id: 'log-1' }),
      finish: async () => undefined,
    }
    const svc = new FlexiHooksService(
      client as never,
      settingsSvc as never,
      ops as never,
    )
    return { svc, client, getRemoteId: () => remoteId, getGv: () => globalVersion }
  }

  it('delete one removes only selected remote hook', async () => {
    const { svc, client } = build(
      [
        { id: '3', url: 'https://http://localhost:3000/flexi/webhook', lastVersion: 1 },
        { id: '5', url: 'https://localhost:3000/flexi/webhook', lastVersion: 2 },
      ],
      {
        webhookUrl: 'https://api.green-angels.sk/flexi/webhook',
        webhookRemoteId: '',
        globalVersion: 99810,
      },
    )
    const r = await svc.deleteOne('3')
    assert.equal(r.ok, true)
    assert.deepEqual(
      client._get().map((h) => h.id),
      ['5'],
    )
    assert.equal(r.globalVersion, 99810)
  })

  it('delete current webhookRemoteId clears local reference', async () => {
    const { svc, getRemoteId } = build(
      [{ id: '5', url: 'https://localhost:3000/flexi/webhook' }],
      {
        webhookUrl: 'https://api.green-angels.sk/flexi/webhook',
        webhookRemoteId: '5',
        globalVersion: 100,
      },
    )
    const r = await svc.deleteOne('5')
    assert.equal(r.ok, true)
    assert.equal(r.clearedWebhookRemoteId, true)
    assert.equal(getRemoteId(), '')
  })

  it('delete unrelated hook preserves local webhookRemoteId', async () => {
    const { svc, getRemoteId } = build(
      [
        { id: '3', url: 'https://http://localhost:3000/flexi/webhook' },
        { id: '9', url: 'https://api.green-angels.sk/flexi/webhook' },
      ],
      {
        webhookUrl: 'https://api.green-angels.sk/flexi/webhook',
        webhookRemoteId: '9',
        globalVersion: 100,
      },
    )
    const r = await svc.deleteOne('3')
    assert.equal(r.ok, true)
    assert.equal(r.clearedWebhookRemoteId, false)
    assert.equal(getRemoteId(), '9')
  })

  it('delete all attempts every returned remote hook', async () => {
    const { svc, client } = build(
      [
        { id: '3', url: 'https://http://localhost:3000/flexi/webhook' },
        { id: '5', url: 'https://localhost:3000/flexi/webhook' },
        { id: '7', url: 'https://other.example/hook' },
      ],
      {
        webhookUrl: 'https://api.green-angels.sk/flexi/webhook',
        webhookRemoteId: '5',
        globalVersion: 42,
      },
    )
    const r = await svc.deleteAll(DELETE_ALL_ABRA_HOOKS_CONFIRM)
    assert.equal(r.ok, true)
    assert.deepEqual(r.requested.sort(), ['3', '5', '7'])
    assert.deepEqual(r.deleted.sort(), ['3', '5', '7'])
    assert.equal(client._get().length, 0)
    assert.equal(r.clearedWebhookRemoteId, true)
    assert.equal(r.globalVersion, 42)
  })

  it('partial failure is not reported as success', async () => {
    const { svc, client } = build(
      [
        { id: '3', url: 'https://a' },
        { id: '5', url: 'https://b' },
      ],
      {
        webhookUrl: 'https://api.green-angels.sk/flexi/webhook',
        webhookRemoteId: '',
        globalVersion: 1,
      },
    )
    const orig = client.deleteHook
    client.deleteHook = async (id: string) => {
      if (id === '5') throw new Error('abra 500')
      return orig(id)
    }
    const r = await svc.deleteAll(DELETE_ALL_ABRA_HOOKS_CONFIRM)
    assert.equal(r.ok, false)
    assert.deepEqual(r.deleted, ['3'])
    assert.equal(r.failed.length, 1)
    assert.equal(r.failed[0]?.id, '5')
    assert.equal(r.remaining.some((h) => h.id === '5'), true)
  })

  it('delete orphans preserves configured CURRENT hook', async () => {
    const { svc, client } = build(
      [
        { id: '3', url: 'https://http://localhost:3000/flexi/webhook' },
        { id: '5', url: 'https://localhost:3000/flexi/webhook' },
        { id: '9', url: 'https://api.green-angels.sk/flexi/webhook' },
      ],
      {
        webhookUrl: 'https://api.green-angels.sk/flexi/webhook',
        webhookRemoteId: '9',
        globalVersion: 10,
      },
    )
    const r = await svc.deleteOrphans(DELETE_ORPHAN_ABRA_HOOKS_CONFIRM)
    assert.equal(r.ok, true)
    assert.deepEqual(r.deleted.sort(), ['3', '5'])
    assert.deepEqual(
      client._get().map((h) => h.id),
      ['9'],
    )
    assert.equal(r.remaining[0]?.classification, 'CURRENT')
  })

  it('empty configured webhookUrl rejects orphan bulk delete', async () => {
    const { svc } = build([{ id: '3', url: 'https://localhost/x' }], {
      webhookUrl: '',
      webhookRemoteId: '',
      globalVersion: 1,
    })
    await assert.rejects(
      () => svc.deleteOrphans(DELETE_ORPHAN_ABRA_HOOKS_CONFIRM),
      /webhookUrl/,
    )
  })

  it('delete hooks leaves globalVersion unchanged', async () => {
    const { svc, getGv } = build([{ id: '3', url: 'https://localhost/x' }], {
      webhookUrl: 'https://api.green-angels.sk/flexi/webhook',
      webhookRemoteId: '',
      globalVersion: 17523,
    })
    await svc.deleteOne('3')
    assert.equal(getGv(), 17523)
  })

  it('service source has no FlexiChangeEvent / Full Refresh / Changes replay', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'flexi-hooks.service.ts'),
      'utf8',
    )
    assert.equal(src.includes('flexiChangeEvent'), false)
    assert.equal(src.includes('prisma.'), false)
    assert.equal(src.includes('fullRefresh'), false)
    assert.equal(src.includes('pollChanges'), false)
    assert.equal(src.includes('ingestChanges'), false)
    assert.equal(/updateSettings\(\{[^}]*globalVersion/.test(src), false)
    assert.equal(/updateSettings\(\{[^}]*webhookAccepting/.test(src), false)
  })

  it('controller marks destructive webhook routes ADMIN-only', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'flexi.controller.ts'),
      'utf8',
    )
    assert.ok(src.includes("@Delete('webhooks/:id')"))
    assert.ok(src.includes("@Post('webhooks/delete-orphans')"))
    assert.ok(src.includes("@Post('webhooks/delete-all')"))
    // Each destructive handler is immediately preceded by @Roles(Role.ADMIN)
    for (const marker of [
      "deleteWebhook(",
      "deleteOrphanWebhooks(",
      "deleteAllWebhooks(",
    ]) {
      const idx = src.indexOf(marker)
      assert.ok(idx > 0, marker)
      const window = src.slice(Math.max(0, idx - 120), idx)
      assert.ok(window.includes('@Roles(Role.ADMIN)'), `${marker} missing ADMIN role`)
    }
  })
})
