import { randomInt } from 'node:crypto'

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DiscountValueType, Prisma, Role } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { UpsertReferralProgramDto } from './dto/upsert-referral-program.dto'

/** 1 бал = 1 грошова одиниця (курс не зберігається в схемі, тому фіксований). */
const POINTS_TO_CURRENCY_RATE = 1
/** Без 0/O та 1/I, щоб уникнути плутанини при введенні коду вручну. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8
const ATTRIBUTION_STATUS_PENDING = 'pending'
const ATTRIBUTION_STATUS_REWARDED = 'rewarded'
const ATTRIBUTION_STATUS_CANCELLED = 'cancelled'
const POINTS_REASON_REFERRAL_REWARD = 'referral_reward'
const POINTS_REASON_REDEEMED = 'redeemed'

const programInclude = { groups: true } as const

type ProgramWithGroups = Prisma.ReferralProgramGetPayload<{ include: typeof programInclude }>
type PrismaTx = Prisma.TransactionClient

export type ReferralProgramSummary = {
  id: string
  isActive: boolean
  refereeDiscountType: DiscountValueType
  refereeDiscountValue: number
  referrerPoints: number
  minOrderSubtotal: number | null
  maxRefereeDiscount: number | null
  cookieDays: number
}

export type RefereeDiscountPreview = {
  eligible: boolean
  discountAmount: number
  referralCodeId: string | null
  referrerUserId: string | null
  reason?: string
}

export type PointsRedemptionPreview = {
  valid: boolean
  points: number
  moneyValue: number
  currentBalance: number
  reason?: string
}

export type OrderLineInput = {
  productVariantId: string
  quantity: number
  lineTotal: number
}

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  private toSummary(program: ProgramWithGroups): ReferralProgramSummary {
    return {
      id: program.id,
      isActive: program.isActive,
      refereeDiscountType: program.refereeDiscountType,
      refereeDiscountValue: Number(program.refereeDiscountValue),
      referrerPoints: program.referrerPoints,
      minOrderSubtotal: program.minOrderSubtotal != null ? Number(program.minOrderSubtotal) : null,
      maxRefereeDiscount: program.maxRefereeDiscount != null ? Number(program.maxRefereeDiscount) : null,
      cookieDays: program.cookieDays,
    }
  }

  private toBackstageResponse(program: ProgramWithGroups) {
    return {
      ...this.toSummary(program),
      name: program.name,
      excludeProductIds: program.excludeProductIds,
      excludeCategoryIds: program.excludeCategoryIds,
      onlyForRoles: program.onlyForRoles,
      groupIds: program.groups.map((row) => row.groupId),
      pointsExpireDays: program.pointsExpireDays,
      createdAt: program.createdAt.toISOString(),
      updatedAt: program.updatedAt.toISOString(),
    }
  }

  async getActiveProgram(): Promise<ProgramWithGroups | null> {
    return this.prisma.referralProgram.findFirst({
      where: { isActive: true },
      include: programInclude,
      orderBy: { createdAt: 'desc' },
    })
  }

  async getPublicProgramSummary(): Promise<ReferralProgramSummary | null> {
    const program = await this.getActiveProgram()
    return program ? this.toSummary(program) : null
  }

  async getBackstageProgram() {
    const program = await this.prisma.referralProgram.findFirst({
      include: programInclude,
      orderBy: { createdAt: 'desc' },
    })
    return program ? this.toBackstageResponse(program) : null
  }

  async upsertProgram(dto: UpsertReferralProgramDto) {
    if (dto.refereeDiscountType === DiscountValueType.PERCENT && dto.refereeDiscountValue > 100) {
      throw new BadRequestException('Відсоток знижки для реферала не може перевищувати 100%.')
    }

    const existing = await this.prisma.referralProgram.findFirst({ orderBy: { createdAt: 'desc' } })

    const data = {
      name: dto.name.trim(),
      isActive: dto.isActive ?? true,
      refereeDiscountType: dto.refereeDiscountType,
      refereeDiscountValue: dto.refereeDiscountValue,
      referrerPoints: dto.referrerPoints ?? 0,
      minOrderSubtotal: dto.minOrderSubtotal ?? null,
      maxRefereeDiscount: dto.maxRefereeDiscount ?? null,
      excludeProductIds: dto.excludeProductIds ?? [],
      excludeCategoryIds: dto.excludeCategoryIds ?? [],
      onlyForRoles: dto.onlyForRoles ?? [],
      cookieDays: dto.cookieDays ?? 30,
      pointsExpireDays: dto.pointsExpireDays ?? null,
    }

    const groupsUpdate = dto.groupIds?.length
      ? { create: dto.groupIds.map((groupId) => ({ groupId })) }
      : undefined

    let program: ProgramWithGroups
    if (existing) {
      await this.prisma.referralProgramGroup.deleteMany({ where: { programId: existing.id } })
      program = await this.prisma.referralProgram.update({
        where: { id: existing.id },
        data: { ...data, groups: groupsUpdate },
        include: programInclude,
      })
    } else {
      program = await this.prisma.referralProgram.create({
        data: { ...data, groups: groupsUpdate },
        include: programInclude,
      })
    }

    return this.toBackstageResponse(program)
  }

  private generateCode(): string {
    let code = ''
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    }
    return code
  }

  private isUserEligibleReferrer(
    program: ProgramWithGroups,
    user: { role: Role; groupIds: string[] },
  ): boolean {
    const hasRoleGate = program.onlyForRoles.length > 0
    const hasGroupGate = program.groups.length > 0
    if (!hasRoleGate && !hasGroupGate) return true

    const roleMatches = hasRoleGate && program.onlyForRoles.includes(user.role)
    const groupMatches =
      hasGroupGate && program.groups.some((row) => user.groupIds.includes(row.groupId))
    return roleMatches || groupMatches
  }

  /** Знаходить або створює реферальний код користувача (навіть якщо він поки не має активної програми). */
  async ensureReferralCode(userId: string): Promise<{ code: string; isActive: boolean }> {
    const existing = await this.prisma.referralCode.findUnique({ where: { userId } })
    if (existing) return { code: existing.code, isActive: existing.isActive }

    const eligible = await this.checkReferrerEligibility(userId)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = this.generateCode()
      try {
        const created = await this.prisma.referralCode.create({
          data: { code, userId, isActive: eligible },
        })
        return { code: created.code, isActive: eligible }
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error
        }
      }
    }

    throw new BadRequestException('Не вдалося створити реферальний код. Спробуйте ще раз.')
  }

  private async checkReferrerEligibility(userId: string): Promise<boolean> {
    const program = await this.getActiveProgram()
    if (!program) return false

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customerGroups: { select: { groupId: true } } },
    })
    if (!user) throw new NotFoundException('Користувача не знайдено.')

    return this.isUserEligibleReferrer(program, {
      role: user.role,
      groupIds: user.customerGroups.map((row) => row.groupId),
    })
  }

  async getBalance(userId: string): Promise<number> {
    const last = await this.prisma.pointsLedgerEntry.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    })
    return last?.balanceAfter ?? 0
  }

  async getMe(userId: string) {
    const program = await this.getActiveProgram()
    const eligible = program ? await this.checkReferrerEligibility(userId) : false
    const existingCode = await this.prisma.referralCode.findUnique({ where: { userId } })
    const shouldHaveCode = eligible || Boolean(existingCode)

    const [code, balance, ledger] = await Promise.all([
      shouldHaveCode ? this.ensureReferralCode(userId) : Promise.resolve(null),
      this.getBalance(userId),
      this.prisma.pointsLedgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    return {
      eligible,
      code: code?.code ?? null,
      isCodeActive: code?.isActive ?? false,
      sharePath: code ? `/?ref=${code.code}` : null,
      balance,
      program: program ? this.toSummary(program) : null,
      ledger: ledger.map((entry) => ({
        id: entry.id,
        delta: entry.delta,
        balanceAfter: entry.balanceAfter,
        reason: entry.reason,
        orderId: entry.orderId,
        createdAt: entry.createdAt.toISOString(),
        expiresAt: entry.expiresAt?.toISOString() ?? null,
      })),
    }
  }

  /** Публічна перевірка коду для попереднього перегляду/встановлення cookie на shop-стороні. */
  async claim(code: string): Promise<{ valid: boolean; cookieDays: number; program: ReferralProgramSummary | null }> {
    const normalized = code.trim().toUpperCase()
    if (!normalized) {
      throw new BadRequestException('Реферальний код не вказано.')
    }

    const program = await this.getActiveProgram()
    if (!program) {
      return { valid: false, cookieDays: 30, program: null }
    }

    const referralCode = await this.prisma.referralCode.findUnique({
      where: { code: normalized },
    })

    const valid = Boolean(referralCode?.isActive)
    return { valid, cookieDays: program.cookieDays, program: this.toSummary(program) }
  }

  private async resolveExcludedEligibleSubtotal(
    program: ProgramWithGroups,
    lines: OrderLineInput[],
  ): Promise<number> {
    if (!program.excludeProductIds.length && !program.excludeCategoryIds.length) {
      return lines.reduce((sum, line) => sum + line.lineTotal, 0)
    }

    const variantIds = lines.map((line) => line.productVariantId)
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true,
        productId: true,
        product: {
          select: { categoryId: true, additionalCategories: { select: { categoryId: true } } },
        },
      },
    })
    const byVariantId = new Map(variants.map((variant) => [variant.id, variant]))

    let eligibleSubtotal = 0
    for (const line of lines) {
      const variant = byVariantId.get(line.productVariantId)
      if (!variant) continue
      if (program.excludeProductIds.includes(variant.productId)) continue
      const categoryIds = [
        variant.product.categoryId,
        ...variant.product.additionalCategories.map((row) => row.categoryId),
      ]
      if (categoryIds.some((id) => program.excludeCategoryIds.includes(id))) continue
      eligibleSubtotal += line.lineTotal
    }
    return eligibleSubtotal
  }

  /**
   * Прев'ю знижки для друга (referee) при оформленні першого замовлення за кодом.
   * Не мутує дані — застосування відбувається у транзакції створення замовлення.
   */
  async previewRefereeDiscount(input: {
    referralCode?: string | null
    refereeUserId: string | null
    productsSubtotal: number
    lines: OrderLineInput[]
  }): Promise<RefereeDiscountPreview> {
    const empty: RefereeDiscountPreview = {
      eligible: false,
      discountAmount: 0,
      referralCodeId: null,
      referrerUserId: null,
    }

    const code = input.referralCode?.trim().toUpperCase()
    if (!code) return empty
    if (!input.refereeUserId) {
      return { ...empty, reason: 'Знижка для друга доступна лише зареєстрованим клієнтам.' }
    }

    const program = await this.getActiveProgram()
    if (!program) return { ...empty, reason: 'Реферальна програма неактивна.' }

    const referralCode = await this.prisma.referralCode.findUnique({ where: { code } })
    if (!referralCode || !referralCode.isActive) {
      return { ...empty, reason: 'Реферальний код недійсний.' }
    }

    if (referralCode.userId === input.refereeUserId) {
      return { ...empty, reason: 'Неможливо застосувати власний реферальний код.' }
    }

    const priorAttribution = await this.prisma.referralAttribution.findFirst({
      where: { refereeUserId: input.refereeUserId },
    })
    if (priorAttribution) {
      return { ...empty, reason: 'Реферальна знижка вже була використана раніше.' }
    }

    if (program.minOrderSubtotal != null && input.productsSubtotal < Number(program.minOrderSubtotal)) {
      return { ...empty, reason: 'Сума замовлення менша за мінімальну для реферальної знижки.' }
    }

    const eligibleSubtotal = await this.resolveExcludedEligibleSubtotal(program, input.lines)
    if (eligibleSubtotal <= 0) {
      return { ...empty, reason: 'Товари в замовленні не підпадають під реферальну знижку.' }
    }

    let discountAmount =
      program.refereeDiscountType === DiscountValueType.PERCENT
        ? Math.round(eligibleSubtotal * (Number(program.refereeDiscountValue) / 100) * 100) / 100
        : Number(program.refereeDiscountValue)

    if (program.maxRefereeDiscount != null) {
      discountAmount = Math.min(discountAmount, Number(program.maxRefereeDiscount))
    }
    discountAmount = Math.min(discountAmount, eligibleSubtotal)
    discountAmount = Math.max(0, Math.round(discountAmount * 100) / 100)

    if (discountAmount <= 0) {
      return { ...empty, reason: 'Реферальна знижка недоступна для цього замовлення.' }
    }

    return {
      eligible: true,
      discountAmount,
      referralCodeId: referralCode.id,
      referrerUserId: referralCode.userId,
    }
  }

  /** Викликається всередині транзакції створення замовлення після резолву referee-знижки. */
  async createAttribution(
    tx: PrismaTx,
    input: { referralCodeId: string; referrerUserId: string; refereeUserId: string; orderId: string },
  ): Promise<void> {
    await tx.referralAttribution.create({
      data: {
        referralCodeId: input.referralCodeId,
        referrerUserId: input.referrerUserId,
        refereeUserId: input.refereeUserId,
        orderId: input.orderId,
        status: ATTRIBUTION_STATUS_PENDING,
      },
    })
  }

  /** Прев'ю списання власних балів клієнта (1 бал = 1 грн). Не мутує баланс. */
  async previewPointsRedemption(userId: string, points: number): Promise<PointsRedemptionPreview> {
    if (points <= 0) {
      return { valid: false, points, moneyValue: 0, currentBalance: 0, reason: 'Вкажіть кількість балів більше нуля.' }
    }

    const currentBalance = await this.getBalance(userId)
    if (points > currentBalance) {
      return {
        valid: false,
        points,
        moneyValue: 0,
        currentBalance,
        reason: 'Недостатньо балів на рахунку.',
      }
    }

    return {
      valid: true,
      points,
      moneyValue: Math.round(points * POINTS_TO_CURRENCY_RATE * 100) / 100,
      currentBalance,
    }
  }

  /** Викликається всередині транзакції створення замовлення. Повертає застосовану суму знижки. */
  async writePointsRedemption(
    tx: PrismaTx,
    input: { userId: string; points: number; orderId: string; maxDiscountAmount: number },
  ): Promise<{ discountAmount: number; pointsSpent: number }> {
    const lastEntry = await tx.pointsLedgerEntry.findFirst({
      where: { userId: input.userId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    })
    const currentBalance = lastEntry?.balanceAfter ?? 0
    const pointsSpent = Math.min(input.points, currentBalance)
    if (pointsSpent <= 0) return { discountAmount: 0, pointsSpent: 0 }

    let discountAmount = Math.round(pointsSpent * POINTS_TO_CURRENCY_RATE * 100) / 100
    discountAmount = Math.min(discountAmount, input.maxDiscountAmount)
    const actualPointsSpent = Math.round(discountAmount / POINTS_TO_CURRENCY_RATE)
    if (actualPointsSpent <= 0) return { discountAmount: 0, pointsSpent: 0 }

    const balanceAfter = currentBalance - actualPointsSpent
    await tx.pointsLedgerEntry.create({
      data: {
        userId: input.userId,
        delta: -actualPointsSpent,
        balanceAfter,
        reason: POINTS_REASON_REDEEMED,
        orderId: input.orderId,
      },
    })

    return { discountAmount, pointsSpent: actualPointsSpent }
  }

  /** Нараховує бали referrer'у, коли замовлення друга досягає PROCESSING/DELIVERED. */
  async creditReferrerPoints(orderId: string): Promise<void> {
    const attribution = await this.prisma.referralAttribution.findUnique({ where: { orderId } })
    if (!attribution || attribution.status !== ATTRIBUTION_STATUS_PENDING) return

    const program = await this.getActiveProgram()
    if (!program || program.referrerPoints <= 0) return

    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.referralAttribution.findUnique({ where: { orderId } })
      if (!fresh || fresh.status !== ATTRIBUTION_STATUS_PENDING) return

      const lastEntry = await tx.pointsLedgerEntry.findFirst({
        where: { userId: fresh.referrerUserId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      })
      const balanceAfter = (lastEntry?.balanceAfter ?? 0) + program.referrerPoints

      await tx.pointsLedgerEntry.create({
        data: {
          userId: fresh.referrerUserId,
          delta: program.referrerPoints,
          balanceAfter,
          reason: POINTS_REASON_REFERRAL_REWARD,
          orderId,
          expiresAt: program.pointsExpireDays
            ? new Date(Date.now() + program.pointsExpireDays * 24 * 60 * 60 * 1000)
            : null,
        },
      })

      await tx.referralAttribution.update({
        where: { id: fresh.id },
        data: { status: ATTRIBUTION_STATUS_REWARDED, rewardedAt: new Date() },
      })
    })
  }

  /** Скасовує нагороду, якщо замовлення друга було відмінене до нарахування балів. */
  async cancelAttributionForOrder(orderId: string): Promise<void> {
    const attribution = await this.prisma.referralAttribution.findUnique({ where: { orderId } })
    if (!attribution || attribution.status !== ATTRIBUTION_STATUS_PENDING) return

    await this.prisma.referralAttribution.update({
      where: { id: attribution.id },
      data: { status: ATTRIBUTION_STATUS_CANCELLED },
    })
  }
}
