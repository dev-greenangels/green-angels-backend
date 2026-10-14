import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class PlantStockJwtAuthGuard extends AuthGuard('jwt-plant-stock') {}
