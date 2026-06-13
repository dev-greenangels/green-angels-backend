import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from '@prisma/client'

import { ROLES_KEY } from '../decorators/roles.decorator'
import type { SessionJwtPayload } from '../auth.constants'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
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

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Недостатньо прав доступу.')
    }

    return true
  }
}
