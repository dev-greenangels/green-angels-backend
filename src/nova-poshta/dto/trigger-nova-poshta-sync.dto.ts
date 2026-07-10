import { IsIn, IsOptional } from 'class-validator'

import type { NpSyncTarget } from '../nova-poshta.constants'

export class TriggerNovaPoshtaSyncDto {
  @IsOptional()
  @IsIn(['all', 'settlements', 'warehouses', 'warehouse_types'])
  target?: NpSyncTarget
}
