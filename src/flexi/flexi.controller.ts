import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { Role } from '@prisma/client'
import type { Request, Response } from 'express'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import type { SessionJwtPayload } from '../auth/auth.constants'
import { FlexiBacklogCleanupService } from './flexi.backlog-cleanup.service'
import { FlexiChangeIntakeService } from './flexi.change-intake.service'
import { FlexiApiUsageService } from './flexi-api-usage.service'
import { FlexiAutoSyncService } from './flexi-auto-sync.service'
import { FlexiFullRefreshService } from './flexi-full-refresh.service'
import { FlexiHooksService } from './flexi-hooks.service'
import { FlexiInboundHealthService } from './flexi-inbound-health.service'
import { FlexiLegacyRetirementService } from './flexi-legacy-retirement.service'
import { LEGACY_DELETE_CONFIRM } from './flexi-legacy-evidence.classification'
import { FlexiLiveSyncService } from './flexi-live-sync.service'
import { FlexiOperationLogService } from './flexi-operation-log.service'
import { FlexiOrderReconcileService } from './flexi-order-reconcile.service'
import { FlexiQueueService } from './flexi.queue.service'
import { FlexiService } from './flexi.service'
import { FlexiSettingsService } from './flexi.settings.service'
import { FlexiSyncLockService } from './flexi-sync-lock.service'
import { parseFlexiWebhookBody } from './flexi-webhook-parse'
import type { FlexiBacklogTier, FlexiChangeEntry, FlexiSettings } from './flexi.types'

@Controller('flexi')
export class FlexiWebhookController {
  constructor(
    private readonly settings: FlexiSettingsService,
    private readonly live: FlexiLiveSyncService,
  ) {}

  /**
   * Flexi Web Hook — must respond 2xx quickly with empty body (<15s).
   * Current-state pipeline: parse → coalesce → enqueue refresh-current (no FlexiChangeEvent).
   * @see https://podpora.flexibee.eu/en/articles/4744379-web-hooks
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-fb-hook-seckey') secKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    res.status(200)
    // Empty body for Flexi compliance
    res.setHeader('Content-Length', '0')

    const settings = await this.settings.getSettings()
    if (!settings.enabled) {
      return
    }
    // Empty notification during hook registration / URL test — not business data.
    if (!body || (typeof body === 'object' && Object.keys(body as object).length === 0)) {
      if (settings.webhookSecKey && secKey && secKey !== settings.webhookSecKey) {
        throw new UnauthorizedException('Invalid Flexi webhook secret')
      }
      if (!settings.webhookSecKey || !secKey || secKey === settings.webhookSecKey) {
        await this.settings.updateSettings({
          lastWebhookTestAt: new Date().toISOString(),
        })
      }
      return
    }
    if (!settings.webhookSecKey || !secKey || secKey !== settings.webhookSecKey) {
      throw new UnauthorizedException('Invalid Flexi webhook secret')
    }
    // Auto Sync OFF: accept (2xx) but do not enqueue inbound catalog/order refreshes.
    if (settings.webhookAccepting === false) {
      await this.settings.updateSettings({
        lastWebhookReceivedAt: new Date().toISOString(),
      })
      return
    }

    const changes: FlexiChangeEntry[] = parseFlexiWebhookBody(body)

    // Valid authenticated delivery (even if no parseable changes) proves reachability.
    await this.settings.updateSettings({
      lastWebhookReceivedAt: new Date().toISOString(),
    })

    if (changes.length > 0) {
      await this.live.enqueueFromChangeEntries(changes, { source: 'LIVE_WEBHOOK' })
    }
  }
}

@Controller('backstage/flexi')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class FlexiAdminController {
  constructor(
    private readonly settings: FlexiSettingsService,
    private readonly flexi: FlexiService,
    private readonly queue: FlexiQueueService,
    private readonly intake: FlexiChangeIntakeService,
    private readonly backlogCleanup: FlexiBacklogCleanupService,
    private readonly live: FlexiLiveSyncService,
    private readonly autoSync: FlexiAutoSyncService,
    private readonly fullRefresh: FlexiFullRefreshService,
    private readonly hooks: FlexiHooksService,
    private readonly orderReconcile: FlexiOrderReconcileService,
    private readonly ops: FlexiOperationLogService,
    private readonly lock: FlexiSyncLockService,
    private readonly health: FlexiInboundHealthService,
    private readonly apiUsage: FlexiApiUsageService,
    private readonly legacyRetirement: FlexiLegacyRetirementService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.getPublicSettings()
  }

  @Patch('settings')
  async updateSettings(@Body() dto: Partial<FlexiSettings>) {
    const next = await this.settings.updateSettings(dto)
    await this.queue.rebuildRepeatableJobs()
    return this.settings.getPublicSettings()
  }

  @Post('test-connection')
  testConnection() {
    return this.flexi.testConnection()
  }

  @Post('register-webhook')
  @HttpCode(200)
  async registerWebhook() {
    const settings = await this.settings.getSettings()
    return this.flexi.registerWebhook({
      lastVersion: settings.globalVersion,
      // Manual diagnostic: only open accepting if Auto Sync is already ON.
      setAccepting: settings.webhookAccepting !== false,
    })
  }

  @Post('disable-webhook')
  @HttpCode(200)
  disableWebhook() {
    return this.flexi.disableWebhook()
  }

  @Get('webhook-status')
  webhookStatus() {
    return this.flexi.refreshWebhookStatus()
  }

  /**
   * Live GET /hooks from ABRA with CURRENT/OTHER labels vs settings.webhookUrl.
   * ADMIN+MANAGER (read). Destructive deletes are ADMIN-only below.
   */
  @Get('webhooks')
  listWebhooks() {
    return this.hooks.listAnnotated()
  }

  /**
   * Delete exactly one remote ABRA hook by id.
   * Does not change globalVersion, Auto Sync, journal, or recreate a hook.
   */
  @Delete('webhooks/:id')
  @Roles(Role.ADMIN)
  deleteWebhook(
    @Param('id') id: string,
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.hooks.deleteOne(id, { initiatedBy: req.user.userId })
  }

  /**
   * Delete remote hooks whose URL ≠ configured webhookUrl.
   * Body: { confirm: "DELETE_ORPHAN_ABRA_HOOKS" }
   */
  @Post('webhooks/delete-orphans')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  deleteOrphanWebhooks(
    @Body() body: { confirm?: string },
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.hooks.deleteOrphans(body?.confirm, { initiatedBy: req.user.userId })
  }

  /**
   * Delete ALL remote ABRA hooks for the company.
   * Body: { confirm: "DELETE_ALL_ABRA_HOOKS" }
   * Does NOT recreate a hook — use Enable Without Update / Update and Enable after.
   */
  @Post('webhooks/delete-all')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  deleteAllWebhooks(
    @Body() body: { confirm?: string },
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.hooks.deleteAll(body?.confirm, { initiatedBy: req.user.userId })
  }

  /** Backup: poll Changes API now */
  @Post('poll-changes')
  async pollChanges() {
    const job = await this.queue.enqueuePollChanges()
    return { ok: true, jobId: job.id, message: 'Poll Changes поставлено в чергу.' }
  }

  @Post('poll-changes/run')
  pollChangesRun() {
    return this.live.pollChangesLive()
  }

  @Post('sync-now')
  async syncNow() {
    return this.pollChanges()
  }

  @Post('sync-now/run')
  syncNowRun() {
    return this.live.pollChangesLive()
  }

  @Post('auto-sync/disable')
  @HttpCode(200)
  autoSyncDisable(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.autoSync.disableAutoSync({ initiatedBy: req.user.userId })
  }

  @Post('auto-sync/enable-without-update')
  @HttpCode(200)
  autoSyncEnableWithoutUpdate(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.autoSync.enableWithoutUpdate({ initiatedBy: req.user.userId })
  }

  @Post('auto-sync/update-and-enable')
  @HttpCode(200)
  autoSyncUpdateAndEnable(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.autoSync.updateAndEnable({ initiatedBy: req.user.userId })
  }

  @Post('orders/reconcile/run')
  @HttpCode(200)
  orderReconcileRun(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.orderReconcile.reconcileActiveErpOrders({ initiatedBy: req.user.userId })
  }

  @Post('full-refresh/run')
  @HttpCode(200)
  fullRefreshRun(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.fullRefresh.runAuthoritative({
      initiatedBy: req.user.userId,
      includeOrders: true,
      advanceBaseline: true,
    })
  }

  @Get('operations')
  async listOperations() {
    const entries = await this.ops.list(40)
    const settings = await this.settings.getSettings()
    const jobs = await this.queue.getJobCounts()
    const openFailures = await this.health.listOpenFailures()
    const healthStatus = this.health.deriveStatus({
      webhookAccepting: settings.webhookAccepting !== false,
      openFailures,
      lastSyncStatus: settings.lastSyncStatus,
    })
    const webhookDeliveryStatus = this.health.deriveWebhookDeliveryStatus({
      webhookAccepting: settings.webhookAccepting !== false,
      webhookUrl: settings.webhookUrl,
      webhookRemoteId: settings.webhookRemoteId,
      lastWebhookReceivedAt: settings.lastWebhookReceivedAt,
      lastWebhookTestAt: settings.lastWebhookTestAt,
      webhookLastError: settings.webhookLastError,
    })
    const apiUsage = await this.apiUsage.snapshot(settings.companyId, settings.apiDailyLimit)
    let remoteHooks: Array<{
      id: string
      url: string
      lastVersion?: number
      classification?: 'CURRENT' | 'OTHER'
    }> = []
    try {
      const listed = await this.hooks.listAnnotated()
      remoteHooks = listed.hooks
    } catch {
      remoteHooks = []
    }
    return {
      entries,
      webhookAccepting: settings.webhookAccepting !== false,
      webhookRemoteId: settings.webhookRemoteId,
      webhookUrl: settings.webhookUrl,
      globalVersion: settings.globalVersion,
      lastSyncAt: settings.lastSyncAt,
      lastSyncStatus: settings.lastSyncStatus,
      lastStromSyncAt: settings.lastStromSyncAt,
      lastWebhookRegisterAt: settings.webhookLastRegisterAt,
      lastWebhookReceivedAt: settings.lastWebhookReceivedAt,
      lastWebhookTestAt: settings.lastWebhookTestAt,
      webhookLastError: settings.webhookLastError,
      ignoredEvidence: this.live.getIgnoredEvidenceCounters(),
      jobs,
      healthStatus,
      webhookDeliveryStatus,
      openFailures,
      apiUsage,
      remoteHooks,
      registeredEvidences: undefined as string[] | undefined,
    }
  }

  /**
   * READ-ONLY FlexiChangeEvent journal statistics. ADMIN only.
   * Evidence never blocks deletion.
   */
  @Get('recovery/legacy-journal/preflight')
  @Roles(Role.ADMIN)
  legacyJournalPreflight() {
    return this.legacyRetirement.preflight()
  }

  /**
   * Stream JSONL backup of FlexiChangeEvent (paged). ADMIN only. No secrets.
   */
  @Get('recovery/legacy-journal/export')
  @Roles(Role.ADMIN)
  async legacyJournalExport(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="flexi-change-event-legacy-${new Date().toISOString().slice(0, 10)}.jsonl"`,
    )
    for await (const chunk of this.legacyRetirement.exportJsonlPages(500)) {
      res.write(chunk)
    }
    res.end()
  }

  /**
   * Permanently delete ALL FlexiChangeEvent rows.
   * Does NOT Full Refresh / reconcile / Changes replay / webhook / Auto Sync / globalVersion.
   * ADMIN only. confirm=DELETE_LEGACY_FLEXI_JOURNAL
   */
  @Post('recovery/retire-legacy-journal')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  async retireLegacyJournal(
    @Req() req: Request & { user: SessionJwtPayload },
    @Body() body?: { confirm?: string },
  ) {
    const result = await this.legacyRetirement.retire({
      initiatedBy: req.user.userId,
      confirm: body?.confirm ?? '',
    })
    if (!result.ok) {
      throw new BadRequestException(result.message)
    }
    return result
  }

  /**
   * @deprecated Alias of retire-legacy-journal (same confirm token).
   */
  @Post('recovery/clear-legacy-journal')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  async recoveryClearLegacyJournal(
    @Req() req: Request & { user: SessionJwtPayload },
    @Body() body?: { confirm?: string },
  ) {
    if (body?.confirm === 'CLEAR_LEGACY_JOURNAL' || body?.confirm === 'RETIRE_LEGACY_FLEXI_JOURNAL') {
      throw new BadRequestException(
        `Використовуйте confirm=${LEGACY_DELETE_CONFIRM}.`,
      )
    }
    return this.retireLegacyJournal(req, body)
  }

  @Post('full-sync')
  async fullSync() {
    const job = await this.queue.enqueueFullSync()
    return { ok: true, jobId: job.id, message: 'Повний sync cenik поставлено в чергу.' }
  }

  @Post('full-sync/run')
  fullSyncRun() {
    return this.flexi.syncCenikFull()
  }

  @Post('sync-strom')
  async syncStrom(@Body() body?: { createMissing?: boolean }) {
    const createMissing = body?.createMissing !== false
    const job = await this.queue.enqueueSyncStrom(createMissing)
    return {
      ok: true,
      jobId: job.id,
      message: createMissing
        ? 'Імпорт з ABRA (Strom) поставлено в чергу.'
        : 'Оновлення існуючих з ABRA поставлено в чергу.',
    }
  }

  @Post('sync-strom/run')
  syncStromRun(@Body() body?: { createMissing?: boolean }) {
    const createMissing = body?.createMissing !== false
    return this.flexi.syncStromCatalog({
      createMissing,
      absorbJournal: false,
      reconcileMissing: true,
    })
  }

  @Post('backfill-category-legacy-ids/run')
  backfillCategoryLegacyIdsRun() {
    return this.flexi.backfillCategoryLegacyIds()
  }

  @Post('import-new-products')
  async importNewProducts() {
    const job = await this.queue.enqueueImportNewProducts()
    return { ok: true, jobId: job.id, message: 'Імпорт (Strom) поставлено в чергу.' }
  }

  @Post('import-new-products/run')
  importNewProductsRun() {
    return this.flexi.importNewProducts()
  }

  @Get('queue')
  async getQueue() {
    const [events, failed, jobs] = await Promise.all([
      this.intake.getQueueEventCounts(),
      this.intake.listFailedEvents(),
      this.queue.getJobCounts(),
    ])
    const settings = await this.settings.getSettings()
    return {
      events,
      failed: failed.map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      })),
      jobs,
      cursor: settings.globalVersion,
    }
  }

  @Post('queue/retry-failed')
  @Roles(Role.ADMIN)
  async retryFailed() {
    // Legacy journal processor is retired — do NOT wake process-intake (would only skip).
    // Mark FAILED → PENDING for audit visibility; repair via Full Refresh.
    const count = await this.intake.retryFailedEvents()
    return {
      ok: true,
      count,
      message:
        count > 0
          ? `Повернено в PENDING: ${count}. Journal processor вимкнено — запустіть Full Refresh для ремонту.`
          : `Повернено в чергу: ${count}.`,
    }
  }

  @Post('queue/skip-failed')
  @Roles(Role.ADMIN)
  async skipFailed() {
    const count = await this.intake.skipFailedEvents()
    const cursor = await this.intake.recomputeAndPersistLastSafeCursor()
    return {
      ok: true,
      count,
      pollStart: cursor.pollStart,
      lastSafeCursor: cursor.lastSafeCursor,
      message: `Пропущено FAILED: ${count}. Курсор pollStart=${cursor.pollStart}.`,
    }
  }

  @Post('queue/drain')
  async drainQueue() {
    const removed = await this.queue.drainWaitingJobs()
    return { ok: true, removed, message: `Знято очікуючих jobs: ${removed}.` }
  }

  @Get('backlog/dry-run')
  backlogDryRun() {
    return this.backlogCleanup.buildDryRun()
  }

  @Post('backlog/close')
  @Roles(Role.ADMIN)
  backlogClose(
    @Req() req: Request & { user: SessionJwtPayload },
    @Body() body: { tier?: FlexiBacklogTier; dryRunHash?: string },
  ) {
    const tier = body?.tier
    const dryRunHash = String(body?.dryRunHash ?? '').trim()
    if (tier !== 'T1' && tier !== 'T2' && tier !== 'T3') {
      throw new BadRequestException('tier must be T1, T2, or T3')
    }
    if (!dryRunHash) {
      throw new BadRequestException('dryRunHash is required')
    }
    return this.backlogCleanup.closeTier({
      tier,
      dryRunHash,
      actorUserId: req.user.userId,
    })
  }
}
