import { ExecutionContext, Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

/** Backstage JWT if cookie/Bearer present; otherwise request continues without req.user. */
@Injectable()
export class OptionalBackstageJwtAuthGuard extends AuthGuard('jwt-backstage') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest<TUser>(_err: unknown, user: TUser): TUser {
    return user
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return (await super.canActivate(context)) as boolean
    } catch {
      return true
    }
  }
}
