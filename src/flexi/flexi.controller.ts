import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
import { FlexiQueueService } from './flexi.queue.service'
import { FlexiService } from './flexi.service'
import { FlexiSettingsService } from './flexi.settings.service'
import type { FlexiBacklogTier, FlexiChangeEntry, FlexiSettings } from './flexi.types'

@Controller('flexi')
export class FlexiWebhookController {
  constructor(
    private readonly settings: FlexiSettingsService,
    private readonly queue: FlexiQueueService,
    private readonly intake: FlexiChangeIntakeService,
  ) {}

  /**
   * Flexi Web Hook — must respond 2xx quickly with empty body (<15s).
   * ERP-WEBHOOK-002A: durable Postgres intake before async process wake-up.
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
    // Empty notification during hook registration (no secKey match yet / empty body)
    if (!body || (typeof body === 'object' && Object.keys(body as object).length === 0)) {
      if (settings.webhookSecKey && secKey && secKey !== settings.webhookSecKey) {
        throw new UnauthorizedException('Invalid Flexi webhook secret')
      }
      return
    }
    if (!settings.webhookSecKey || !secKey || secKey !== settings.webhookSecKey) {
      throw new UnauthorizedException('Invalid Flexi webhook secret')
    }
    // 002C: disable webhook ≠ disable ERP sync (Changes poll remains).
    if (settings.webhookAccepting === false) {
      return
    }

    const root =
      body && typeof body === 'object' && 'winstrom' in body
        ? (body as { winstrom: Record<string, unknown> }).winstrom
        : (body as Record<string, unknown> | null)

    const rawChanges = root?.change ?? root?.changes ?? []
    const list = Array.isArray(rawChanges) ? rawChanges : rawChanges ? [rawChanges] : []
    const changes: FlexiChangeEntry[] = list.map((c) => {
      const row = c as Record<string, unknown>
      const inRaw = row['@in-version'] ?? row.inVersion ?? row['in-version']
      const inNum = Number(inRaw)
      return {
        evidence: String(row.evidence ?? row['@evidence'] ?? ''),
        id: (row.id ?? row['@id']) as string | number | undefined,
        operation: String(row.operation ?? row['@operation'] ?? ''),
        globalVersion: Number(row.globalVersion ?? row['@globalVersion'] ?? 0) || undefined,
        inVersion: Number.isFinite(inNum) && inNum > 0 ? Math.trunc(inNum) : undefined,
      }
    })

    const nextRaw = root?.next
    const nextVersion =
      nextRaw === 'none' || nextRaw === undefined || nextRaw === null
        ? undefined
        : Number(nextRaw)

    if (changes.length > 0) {
      // Durable before async — Postgres is source of truth for receipt
      await this.intake.ingestChanges(changes)
      await this.queue.enqueueProcessIntake(
        Number.isFinite(nextVersion) ? nextVersion : undefined,
      )
    } else if (typeof nextVersion === 'number' && Number.isFinite(nextVersion)) {
      // Cursor-only delivery (no change rows) — still wake processor for safe cursor catch-up
      await this.queue.enqueueProcessIntake(nextVersion)
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
  registerWebhook() {
    return this.flexi.registerWebhook()
  }

  @Post('disable-webhook')
  disableWebhook() {
    return this.flexi.disableWebhook()
  }

  @Get('webhook-status')
  webhookStatus() {
    return this.flexi.refreshWebhookStatus()
  }

  /** Backup: poll Changes API now */
  @Post('poll-changes')
  async pollChanges() {
    const job = await this.queue.enqueuePollChanges()
    return { ok: true, jobId: job.id, message: 'Poll Changes поставлено в чергу.' }
  }

  @Post('poll-changes/run')
  pollChangesRun() {
    return this.flexi.pollChanges()
  }

  @Post('sync-now')
  async syncNow() {
    return this.pollChanges()
  }

  @Post('sync-now/run')
  syncNowRun() {
    return this.flexi.pollChanges()
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
    return this.flexi.syncStromCatalog({ createMissing, absorbJournal: true })
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
  async retryFailed() {
    const count = await this.intake.retryFailedEvents()
    if (count > 0) {
      await this.queue.enqueueProcessIntake()
    }
    return { ok: true, count, message: `Повернено в чергу: ${count}.` }
  }

  @Post('queue/skip-failed')
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
