import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import type { CancellationSource } from '../orders/order-status.constants'
import { PrismaService } from '../prisma/prisma.service'
import { UpsertCancellationReasonDto } from './dto/upsert-cancellation-reason.dto'

export type CancellationReasonResponse = {
  id: string
  code: string
  nameUk: string
  nameEn: string | null
  nameSk: string | null
  allowAdmin: boolean
  allowUser: boolean
  allowSystem: boolean
  isActive: boolean
  sortOrder: number
}

@Injectable()
export class CancellationReasonsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(row: CancellationReasonResponse): CancellationReasonResponse {
    return { ...row }
  }

  async findAll(options?: {
    activeOnly?: boolean
    source?: CancellationSource
  }): Promise<CancellationReasonResponse[]> {
    const rows = await this.prisma.cancellationReason.findMany({
      where: {
        ...(options?.activeOnly ? { isActive: true } : {}),
        ...(options?.source === 'ADMIN' ? { allowAdmin: true } : {}),
        ...(options?.source === 'USER' ? { allowUser: true } : {}),
        ...(options?.source === 'SYSTEM' ? { allowSystem: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    })
    return rows.map((row) => this.toResponse(row))
  }

  async assertUsable(id: string, source: CancellationSource): Promise<void> {
    const row = await this.prisma.cancellationReason.findUnique({ where: { id } })
    if (!row || !row.isActive) {
      throw new BadRequestException('Причина скасування недоступна.')
    }
    if (source === 'ADMIN' && !row.allowAdmin) {
      throw new BadRequestException('Цю причину не можна обрати адміном.')
    }
    if (source === 'USER' && !row.allowUser) {
      throw new BadRequestException('Цю причину не можна обрати користувачем.')
    }
    if (source === 'SYSTEM' && !row.allowSystem) {
      throw new BadRequestException('Цю причину не можна використати системою.')
    }
  }

  async create(dto: UpsertCancellationReasonDto): Promise<CancellationReasonResponse> {
    const code = dto.code.trim().toLowerCase()
    const existing = await this.prisma.cancellationReason.findUnique({ where: { code } })
    if (existing) throw new ConflictException('Причина з таким кодом вже існує.')

    const created = await this.prisma.cancellationReason.create({
      data: {
        code,
        nameUk: dto.nameUk.trim(),
        nameEn: dto.nameEn?.trim() || null,
        nameSk: dto.nameSk?.trim() || null,
        allowAdmin: dto.allowAdmin ?? true,
        allowUser: dto.allowUser ?? false,
        allowSystem: dto.allowSystem ?? false,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 100,
      },
    })
    return this.toResponse(created)
  }

  async update(
    id: string,
    dto: UpsertCancellationReasonDto,
  ): Promise<CancellationReasonResponse> {
    const target = await this.prisma.cancellationReason.findUnique({ where: { id } })
    if (!target) throw new NotFoundException('Причину не знайдено.')

    if (dto.code.trim().toLowerCase() !== target.code) {
      throw new BadRequestException('Код причини не можна змінити.')
    }

    const updated = await this.prisma.cancellationReason.update({
      where: { id },
      data: {
        nameUk: dto.nameUk.trim(),
        nameEn: dto.nameEn?.trim() || null,
        nameSk: dto.nameSk?.trim() || null,
        allowAdmin: dto.allowAdmin ?? target.allowAdmin,
        allowUser: dto.allowUser ?? target.allowUser,
        allowSystem: dto.allowSystem ?? target.allowSystem,
        isActive: dto.isActive ?? target.isActive,
        sortOrder: dto.sortOrder ?? target.sortOrder,
      },
    })
    return this.toResponse(updated)
  }

  async remove(id: string): Promise<{ ok: true }> {
    const target = await this.prisma.cancellationReason.findUnique({ where: { id } })
    if (!target) throw new NotFoundException('Причину не знайдено.')

    const inUse = await this.prisma.order.count({ where: { cancellationReasonId: id } })
    if (inUse > 0) {
      throw new BadRequestException(
        'Причина використовується в замовленнях. Вимкніть її замість видалення.',
      )
    }

    await this.prisma.cancellationReason.delete({ where: { id } })
    return { ok: true }
  }
}
