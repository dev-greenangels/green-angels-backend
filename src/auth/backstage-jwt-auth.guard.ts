import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class BackstageJwtAuthGuard extends AuthGuard('jwt-backstage') {}
