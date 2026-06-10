import { IsIn } from 'class-validator'

import { ORDER_STATUSES } from '../order-status.constants'

export class PatchOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status!: (typeof ORDER_STATUSES)[number]
}
