import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Role } from '@prisma/client'

import { PrismaService } from '../../prisma/prisma.service'
import {
  existingPermissionKeys,
  isStaffPermission,
  permissionDefinitionsForUi,
  type StaffPermission,
} from './permission.registry'

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  listRegistry() {
    return permissionDefinitionsForUi().map((p) => ({
      key: p.key,
      group: p.group,
      labelKey: p.labelKey,
      descriptionKey: p.descriptionKey,
      status: p.status,
    }))
  }

  async getUserPermissions(userId: string): Promise<StaffPermission[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    if (!user) throw new NotFoundException('Користувача не знайдено.')
    if (user.role === Role.ADMIN) {
      return existingPermissionKeys()
    }
    if (user.role !== Role.MANAGER) {
      return []
    }
    const rows = await this.prisma.userPermission.findMany({
      where: { userId },
      select: { permission: true },
    })
    return rows.map((r) => r.permission).filter(isStaffPermission)
  }

  /**
   * ADMIN → true. MANAGER → any of required (OR). Fail-closed on missing grants.
   */
  async userHasAnyPermission(
    userId: string,
    required: StaffPermission[],
  ): Promise<boolean> {
    if (required.length === 0) return false
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    if (!user) return false
    if (user.role === Role.ADMIN) return true
    if (user.role !== Role.MANAGER) return false

    const count = await this.prisma.userPermission.count({
      where: {
        userId,
        permission: { in: required },
      },
    })
    return count > 0
  }

  async assertManagerHas(
    userId: string,
    required: StaffPermission[],
  ): Promise<void> {
    const ok = await this.userHasAnyPermission(userId, required)
    if (!ok) {
      throw new ForbiddenException('Недостатньо прав доступу.')
    }
  }

  async replaceManagerPermissions(
    targetUserId: string,
    permissions: string[],
    actorUserId: string,
  ): Promise<StaffPermission[]> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, role: true },
    })
    if (!actor || actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Лише адміністратор може змінювати права.')
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    })
    if (!target) throw new NotFoundException('Користувача не знайдено.')
    if (target.role === Role.ADMIN) {
      throw new BadRequestException('Права адміністратора не редагуються галочками.')
    }
    if (target.role !== Role.MANAGER) {
      throw new BadRequestException('Права можна призначати лише менеджерам.')
    }

    const unique = [...new Set(permissions.map((p) => p.trim()).filter(Boolean))]
    for (const key of unique) {
      if (!isStaffPermission(key)) {
        throw new BadRequestException(`Невідомий дозвіл: ${key}`)
      }
      const def = permissionDefinitionsForUi().find((d) => d.key === key)
      if (!def) {
        throw new BadRequestException(`Дозвіл недоступний для призначення: ${key}`)
      }
    }

    const keys = unique as StaffPermission[]

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId: targetUserId } })
      if (keys.length > 0) {
        await tx.userPermission.createMany({
          data: keys.map((permission) => ({
            userId: targetUserId,
            permission,
            createdByUserId: actorUserId,
          })),
        })
      }
    })

    return this.getUserPermissions(targetUserId)
  }
}
