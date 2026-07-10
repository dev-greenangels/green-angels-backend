import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'

import { IS_PUBLIC_KEY } from './decorators/public.decorator'

/**
 * Guard для estimate-photo API: заголовок `x-api-key` має збігатися з PHOTO_API_KEYS.
 * Застосовується лише на контролерах /photos і /viber (не глобально).
 */
@Injectable()
export class PhotoApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const expected = this.config.get<string>('PHOTO_API_KEYS')?.trim()
    if (!expected) {
      throw new ForbiddenException('PHOTO_API_KEYS is not configured')
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>()
    const apiKey = request.headers['x-api-key']
    if (!apiKey || apiKey !== expected) {
      throw new ForbiddenException('Invalid or missing API key')
    }

    return true
  }
}
