import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from '@prisma/client'

import { ROLES_KEY } from '../decorators/roles.decorator'
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator'
import type { SessionJwtPayload } from '../auth.constants'
import type { StaffPermission } from '../permissions/permission.registry'
import { PermissionsService } from '../permissions/permissions.service'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * Role check + fail-closed MANAGER permissions (always on).
 * ADMIN bypasses permissions. Missing @RequirePermissions on MANAGER-allowed routes → 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles?.length) return true

    const request = context.switchToHttp().getRequest<{ user?: SessionJwtPayload }>()
    const userId = request.user?.userId
    if (!userId) return false

    let user: { role: Role } | null
    try {
      user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      })
    } catch {
      throw new ServiceUnavailableException('Не вдалося перевірити права доступу.')
    }

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Недостатньо прав доступу.')
    }

    if (user.role === Role.ADMIN) {
      return true
    }

    if (user.role !== Role.MANAGER) {
      return true
    }

    // MANAGER on a route that allows MANAGER
    if (!requiredRoles.includes(Role.MANAGER)) {
      return true
    }

    // Method-level @RequirePermissions overrides class-level (Nest getAllAndOverride).
    // Write handlers must declare manage/edit only — never rely on class view+manage OR.
    const requiredPerms = this.reflector.getAllAndOverride<StaffPermission[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (!requiredPerms?.length) {
      // Fail-closed: no policy on MANAGER-allowed staff route
      throw new ForbiddenException(
        'Недостатньо прав доступу (відсутня політика дозволів).',
      )
    }

    try {
      const ok = await this.permissions.userHasAnyPermission(userId, requiredPerms)
      if (!ok) {
        throw new ForbiddenException('Недостатньо прав доступу.')
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error
      throw new ServiceUnavailableException('Не вдалося перевірити права доступу.')
    }

    return true
  }
}
