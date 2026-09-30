import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { FLEXI_OPERATION_LOG_KEY, FLEXI_OPERATION_LOG_MAX } from './flexi.constants'

export type FlexiOperationType =
  | 'FULL_REFRESH'
  | 'LIVE_REFRESH'
  | 'AUTO_SYNC_ENABLE'
  | 'AUTO_SYNC_DISABLE'
  | 'UPDATE_AND_ENABLE'
  | 'ENABLE_WITHOUT_UPDATE'
  | 'ORDER_RECONCILE'
  | 'RECOVERY'
  | 'WEBHOOK_HOOK_DELETE'
  | 'WEBHOOK_HOOKS_DELETE_ORPHANS'
  | 'WEBHOOK_HOOKS_DELETE_ALL'
  | 'ERROR'

export type FlexiOperationLogEntry = {
  id: string
  at: string
  operation: FlexiOperationType
  status: 'ok' | 'error' | 'running'
  durationMs?: number
  initiatedBy?: string
  refreshed?: number
  ignored?: number
  failed?: number
  error?: string
  detail?: string
  webhookAccepting?: boolean
}

type Store = { entries: FlexiOperationLogEntry[] }

@Injectable()
export class FlexiOperationLogService {
  private readonly logger = new Logger(FlexiOperationLogService.name)

  constructor(private readonly prisma: PrismaService) {}

  async list(limit = 40): Promise<FlexiOperationLogEntry[]> {
    const store = await this.read()
    return store.entries.slice(-Math.min(100, Math.max(1, limit))).reverse()
  }

  async append(entry: Omit<FlexiOperationLogEntry, 'id' | 'at'> & { at?: string }): Promise<FlexiOperationLogEntry> {
    const full: FlexiOperationLogEntry = {
      id: crypto.randomUUID(),
      at: entry.at ?? new Date().toISOString(),
      ...entry,
    }
    const store = await this.read()
    store.entries.push(full)
    if (store.entries.length > FLEXI_OPERATION_LOG_MAX) {
      store.entries = store.entries.slice(-FLEXI_OPERATION_LOG_MAX)
    }
    await this.write(store)
    return full
  }

  async start(
    operation: FlexiOperationType,
    opts?: { initiatedBy?: string; detail?: string },
  ): Promise<FlexiOperationLogEntry> {
    return this.append({
      operation,
      status: 'running',
      initiatedBy: opts?.initiatedBy,
      detail: opts?.detail,
    })
  }

  async finish(
    id: string,
    patch: Partial<Omit<FlexiOperationLogEntry, 'id' | 'operation'>>,
  ): Promise<void> {
    const store = await this.read()
    const idx = store.entries.findIndex((e) => e.id === id)
    if (idx < 0) {
      this.logger.warn(`operation log finish: id ${id} not found`)
      return
    }
    store.entries[idx] = { ...store.entries[idx]!, ...patch }
    await this.write(store)
  }

  private async read(): Promise<Store> {
    const row = await this.prisma.settings.findUnique({ where: { key: FLEXI_OPERATION_LOG_KEY } })
    if (!row?.value?.trim()) return { entries: [] }
    try {
      const parsed = JSON.parse(row.value) as Store
      return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] }
    } catch {
      return { entries: [] }
    }
  }

  private async write(store: Store): Promise<void> {
    await this.prisma.settings.upsert({
      where: { key: FLEXI_OPERATION_LOG_KEY },
      create: { key: FLEXI_OPERATION_LOG_KEY, value: JSON.stringify(store) },
      update: { value: JSON.stringify(store) },
    })
  }
}
