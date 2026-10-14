import { SetMetadata } from '@nestjs/common'

import type { StaffPermission } from '../permissions/permission.registry'

export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions'

/**
 * MANAGER must hold at least one of the listed permissions (OR).
 * ADMIN bypasses. Missing decorator on MANAGER-allowed routes → deny.
 */
export const RequirePermissions = (...permissions: StaffPermission[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions)
