import { Injectable } from '@nestjs/common'
import { NotFoundException } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { CreateRedirectDto } from './dto/create-redirect.dto'
import { UpdateRedirectDto } from './dto/update-redirect.dto'

const REDIRECTS_CACHE_KEY = 'redirects:active:v1'
const REDIRECTS_CACHE_TTL_SEC = 300

export type RedirectRecord = {
  id: string
  fromPath: string
  toPath: string
  statusCode: number
  isActive: boolean
  prefix: string | null
  hitCount: number
  lastHitAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ActiveRedirectEntry = {
  toPath: string
  statusCode: number
}

function normalizeRedirectPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return '/'
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (withLeading.length > 1 && withLeading.endsWith('/')) {
    return withLeading.slice(0, -1)
  }
  return withLeading
}

function extractPrefix(fromPath: string): string | null {
  const normalized = normalizeRedirectPath(fromPath)
  const segments = normalized.split('/').filter(Boolean)
  return segments[0] ?? null
}

@Injectable()
export class RedirectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private toRecord(row: {
    id: string
    fromPath: string
    toPath: string
    statusCode: number
    isActive: boolean
    prefix: string | null
    hitCount: number
    lastHitAt: Date | null
    createdAt: Date
    updatedAt: Date
  }): RedirectRecord {
    return { ...row }
  }

  async invalidateCache(): Promise<void> {
    await this.redis.client.del(REDIRECTS_CACHE_KEY)
  }

  async findAll(prefix?: string): Promise<RedirectRecord[]> {
    const rows = await this.prisma.redirect.findMany({
      where: prefix?.trim() ? { prefix: prefix.trim() } : undefined,
      orderBy: [{ prefix: 'asc' }, { fromPath: 'asc' }],
    })
    return rows.map((row) => this.toRecord(row))
  }

  async findById(id: string): Promise<RedirectRecord> {
    const row = await this.prisma.redirect.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Редірект не знайдено')
    return this.toRecord(row)
  }

  async create(dto: CreateRedirectDto): Promise<RedirectRecord> {
    const fromPath = normalizeRedirectPath(dto.fromPath)
    const toPath = normalizeRedirectPath(dto.toPath)
    const row = await this.prisma.redirect.create({
      data: {
        fromPath,
        toPath,
        statusCode: dto.statusCode ?? 301,
        isActive: dto.isActive ?? true,
        prefix: dto.prefix?.trim() || extractPrefix(fromPath),
      },
    })
    await this.invalidateCache()
    return this.toRecord(row)
  }

  async update(id: string, dto: UpdateRedirectDto): Promise<RedirectRecord> {
    await this.findById(id)
    const fromPath = dto.fromPath != null ? normalizeRedirectPath(dto.fromPath) : undefined
    const toPath = dto.toPath != null ? normalizeRedirectPath(dto.toPath) : undefined
    const row = await this.prisma.redirect.update({
      where: { id },
      data: {
        fromPath,
        toPath,
        statusCode: dto.statusCode,
        isActive: dto.isActive,
        prefix:
          dto.prefix !== undefined
            ? dto.prefix?.trim() || (fromPath ? extractPrefix(fromPath) : undefined)
            : undefined,
      },
    })
    await this.invalidateCache()
    return this.toRecord(row)
  }

  async remove(id: string): Promise<void> {
    await this.findById(id)
    await this.prisma.redirect.delete({ where: { id } })
    await this.invalidateCache()
  }

  async getActiveMap(): Promise<Record<string, ActiveRedirectEntry>> {
    const cached = await this.redis.client.get(REDIRECTS_CACHE_KEY)
    if (cached) {
      try {
        return JSON.parse(cached) as Record<string, ActiveRedirectEntry>
      } catch {
        await this.invalidateCache()
      }
    }

    const rows = await this.prisma.redirect.findMany({
      where: { isActive: true },
      select: { fromPath: true, toPath: true, statusCode: true },
    })

    const map: Record<string, ActiveRedirectEntry> = {}
    for (const row of rows) {
      map[normalizeRedirectPath(row.fromPath)] = {
        toPath: normalizeRedirectPath(row.toPath),
        statusCode: row.statusCode,
      }
    }

    await this.redis.client.set(
      REDIRECTS_CACHE_KEY,
      JSON.stringify(map),
      'EX',
      REDIRECTS_CACHE_TTL_SEC,
    )

    return map
  }

  async resolve(path: string): Promise<(ActiveRedirectEntry & { fromPath: string }) | null> {
    const normalized = normalizeRedirectPath(path)
    const map = await this.getActiveMap()
    const hit = map[normalized]
    if (!hit) return null

    void this.recordHit(normalized)
    return { fromPath: normalized, ...hit }
  }

  private async recordHit(fromPath: string): Promise<void> {
    try {
      await this.prisma.redirect.updateMany({
        where: { fromPath, isActive: true },
        data: {
          hitCount: { increment: 1 },
          lastHitAt: new Date(),
        },
      })
    } catch {
      // hit tracking is best-effort
    }
  }

  async listPrefixes(): Promise<string[]> {
    const rows = await this.prisma.redirect.findMany({
      where: { prefix: { not: null } },
      distinct: ['prefix'],
      select: { prefix: true },
      orderBy: { prefix: 'asc' },
    })
    return rows.map((row) => row.prefix).filter((value): value is string => Boolean(value))
  }
}
