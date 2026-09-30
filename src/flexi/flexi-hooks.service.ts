import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'

import { FlexiClient } from './flexi.client'
import {
  DELETE_ALL_ABRA_HOOKS_CONFIRM,
  DELETE_ORPHAN_ABRA_HOOKS_CONFIRM,
  classifyRemoteHook,
  isValidHookId,
  normalizeHookUrl,
} from './flexi-hooks.constants'
import { FlexiOperationLogService } from './flexi-operation-log.service'
import { FlexiSettingsService } from './flexi.settings.service'

export type FlexiRemoteHookView = {
  id: string
  url: string
  lastVersion?: number
  format?: string
  classification: 'CURRENT' | 'OTHER'
}

export type FlexiHookDeleteOneResult = {
  ok: boolean
  deletedId: string
  clearedWebhookRemoteId: boolean
  remaining: FlexiRemoteHookView[]
  webhookRemoteId: string
  globalVersion: number
  message: string
}

export type FlexiHookBulkDeleteResult = {
  ok: boolean
  requested: string[]
  deleted: string[]
  failed: Array<{ id: string; error: string }>
  remaining: FlexiRemoteHookView[]
  clearedWebhookRemoteId: boolean
  webhookRemoteId: string
  globalVersion: number
  message: string
}

/**
 * Manual ABRA /hooks management only.
 * Does NOT touch FlexiChangeEvent, globalVersion, Full Refresh, Changes replay,
 * products/orders/stock, or webhookAccepting (Auto Sync).
 */
@Injectable()
export class FlexiHooksService {
  private readonly logger = new Logger(FlexiHooksService.name)

  constructor(
    private readonly client: FlexiClient,
    private readonly settings: FlexiSettingsService,
    private readonly ops: FlexiOperationLogService,
  ) {}

  async listAnnotated(): Promise<{
    hooks: FlexiRemoteHookView[]
    webhookUrl: string
    webhookRemoteId: string
    globalVersion: number
  }> {
    const settings = await this.settings.getSettings()
    const hooks = await this.client.listHooks()
    return {
      hooks: hooks.map((h) => ({
        ...h,
        classification: classifyRemoteHook(h.url, settings.webhookUrl),
      })),
      webhookUrl: settings.webhookUrl,
      webhookRemoteId: settings.webhookRemoteId,
      globalVersion: settings.globalVersion,
    }
  }

  async deleteOne(hookIdRaw: string, opts?: { initiatedBy?: string }): Promise<FlexiHookDeleteOneResult> {
    const hookId = hookIdRaw.trim()
    if (!isValidHookId(hookId)) {
      throw new BadRequestException('Некоректний id webhook-а ABRA.')
    }

    const before = await this.settings.getSettings()
    const globalVersion = before.globalVersion
    const log = await this.ops.start('WEBHOOK_HOOK_DELETE', {
      initiatedBy: opts?.initiatedBy,
      detail: `source=HOOK_DELETE; id=${hookId}`,
    })

    try {
      const existing = await this.client.listHooks()
      if (!existing.some((h) => h.id === hookId)) {
        throw new NotFoundException(`Hook id=${hookId} не знайдено в ABRA /hooks.`)
      }

      await this.client.deleteHook(hookId)

      const afterHooks = await this.client.listHooks()
      if (afterHooks.some((h) => h.id === hookId)) {
        const message = `Видалення id=${hookId} не підтверджено GET /hooks.`
        await this.ops.finish(log.id, {
          status: 'error',
          error: message,
          detail: message,
          webhookAccepting: before.webhookAccepting !== false,
        })
        return {
          ok: false,
          deletedId: hookId,
          clearedWebhookRemoteId: false,
          remaining: this.annotate(afterHooks, before.webhookUrl),
          webhookRemoteId: before.webhookRemoteId,
          globalVersion,
          message,
        }
      }

      let clearedWebhookRemoteId = false
      let webhookRemoteId = before.webhookRemoteId
      if (before.webhookRemoteId && before.webhookRemoteId === hookId) {
        await this.settings.updateSettings({
          webhookRemoteId: '',
          webhookLastError: '',
        })
        clearedWebhookRemoteId = true
        webhookRemoteId = ''
      }

      const message = `Видалено ABRA hook id=${hookId}. Auto Sync / globalVersion не змінювались.`
      await this.ops.finish(log.id, {
        status: 'ok',
        detail: message,
        webhookAccepting: before.webhookAccepting !== false,
      })

      return {
        ok: true,
        deletedId: hookId,
        clearedWebhookRemoteId,
        remaining: this.annotate(afterHooks, before.webhookUrl),
        webhookRemoteId,
        globalVersion,
        message,
      }
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        await this.ops.finish(log.id, {
          status: 'error',
          error: error.message,
          webhookAccepting: before.webhookAccepting !== false,
        })
        throw error
      }
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`deleteOne hook ${hookId}: ${message}`)
      await this.ops.finish(log.id, {
        status: 'error',
        error: message,
        webhookAccepting: before.webhookAccepting !== false,
      })
      throw error
    }
  }

  async deleteOrphans(
    confirm: string | undefined,
    opts?: { initiatedBy?: string },
  ): Promise<FlexiHookBulkDeleteResult> {
    if (confirm !== DELETE_ORPHAN_ABRA_HOOKS_CONFIRM) {
      throw new BadRequestException(
        `Потрібне підтвердження confirm=${DELETE_ORPHAN_ABRA_HOOKS_CONFIRM}.`,
      )
    }

    const before = await this.settings.getSettings()
    const configured = before.webhookUrl.trim()
    if (!configured) {
      throw new BadRequestException(
        'webhookUrl порожній — видалення сторонніх hooks вимкнено (немає CURRENT для збереження).',
      )
    }

    const wanted = normalizeHookUrl(configured)
    const existing = await this.client.listHooks()
    const targets = existing.filter((h) => normalizeHookUrl(h.url) !== wanted)
    return this.deleteMany(targets.map((h) => h.id), {
      initiatedBy: opts?.initiatedBy,
      operation: 'WEBHOOK_HOOKS_DELETE_ORPHANS',
      detailPrefix: 'source=HOOK_DELETE_ORPHANS',
      preserveCurrentRemoteId: true,
      configuredUrl: configured,
      beforeGlobalVersion: before.globalVersion,
      beforeRemoteId: before.webhookRemoteId,
      beforeAccepting: before.webhookAccepting !== false,
    })
  }

  async deleteAll(
    confirm: string | undefined,
    opts?: { initiatedBy?: string },
  ): Promise<FlexiHookBulkDeleteResult> {
    if (confirm !== DELETE_ALL_ABRA_HOOKS_CONFIRM) {
      throw new BadRequestException(
        `Потрібне підтвердження confirm=${DELETE_ALL_ABRA_HOOKS_CONFIRM}.`,
      )
    }

    const before = await this.settings.getSettings()
    const existing = await this.client.listHooks()
    return this.deleteMany(existing.map((h) => h.id), {
      initiatedBy: opts?.initiatedBy,
      operation: 'WEBHOOK_HOOKS_DELETE_ALL',
      detailPrefix: 'source=HOOK_DELETE_ALL',
      preserveCurrentRemoteId: false,
      configuredUrl: before.webhookUrl,
      beforeGlobalVersion: before.globalVersion,
      beforeRemoteId: before.webhookRemoteId,
      beforeAccepting: before.webhookAccepting !== false,
    })
  }

  private async deleteMany(
    ids: string[],
    ctx: {
      initiatedBy?: string
      operation: 'WEBHOOK_HOOKS_DELETE_ALL' | 'WEBHOOK_HOOKS_DELETE_ORPHANS'
      detailPrefix: string
      preserveCurrentRemoteId: boolean
      configuredUrl: string
      beforeGlobalVersion: number
      beforeRemoteId: string
      beforeAccepting: boolean
    },
  ): Promise<FlexiHookBulkDeleteResult> {
    const requested = [...new Set(ids.map((id) => id.trim()).filter(isValidHookId))]
    const log = await this.ops.start(ctx.operation, {
      initiatedBy: ctx.initiatedBy,
      detail: `${ctx.detailPrefix}; requested=${requested.length}`,
    })

    const deleted: string[] = []
    const failed: Array<{ id: string; error: string }> = []

    for (const id of requested) {
      try {
        await this.client.deleteHook(id)
        deleted.push(id)
      } catch (error) {
        failed.push({
          id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const afterHooks = await this.client.listHooks()
    const remainingIds = new Set(afterHooks.map((h) => h.id))
    // Deletion claimed but still present → treat as failure.
    for (const id of deleted) {
      if (remainingIds.has(id)) {
        failed.push({ id, error: 'Still present after DELETE (GET /hooks).' })
      }
    }
    const trulyDeleted = deleted.filter((id) => !remainingIds.has(id))

    let webhookRemoteId = ctx.beforeRemoteId
    let clearedWebhookRemoteId = false
    if (!ctx.preserveCurrentRemoteId) {
      if (ctx.beforeRemoteId) {
        await this.settings.updateSettings({
          webhookRemoteId: '',
          webhookLastError: '',
        })
        clearedWebhookRemoteId = true
        webhookRemoteId = ''
      }
    } else if (ctx.beforeRemoteId && trulyDeleted.includes(ctx.beforeRemoteId)) {
      // Remote id pointed at an orphan that we removed.
      await this.settings.updateSettings({
        webhookRemoteId: '',
        webhookLastError: '',
      })
      clearedWebhookRemoteId = true
      webhookRemoteId = ''
    }

    const ok =
      failed.length === 0 &&
      requested.every((id) => !remainingIds.has(id))

    const message = ok
      ? `Видалено hooks: ${trulyDeleted.length}. Не створюємо новий hook автоматично.`
      : `Частковий результат: deleted=${trulyDeleted.length}, failed=${failed.length}, remaining=${afterHooks.length}.`

    await this.ops.finish(log.id, {
      status: ok ? 'ok' : 'error',
      detail: `${ctx.detailPrefix}; ${message}`,
      error: ok ? undefined : message,
      webhookAccepting: ctx.beforeAccepting,
    })

    return {
      ok,
      requested,
      deleted: trulyDeleted,
      failed,
      remaining: this.annotate(afterHooks, ctx.configuredUrl),
      clearedWebhookRemoteId,
      webhookRemoteId,
      globalVersion: ctx.beforeGlobalVersion,
      message,
    }
  }

  private annotate(
    hooks: Array<{ id: string; url: string; lastVersion?: number; format?: string }>,
    configuredWebhookUrl: string,
  ): FlexiRemoteHookView[] {
    return hooks.map((h) => ({
      ...h,
      classification: classifyRemoteHook(h.url, configuredWebhookUrl),
    }))
  }
}
