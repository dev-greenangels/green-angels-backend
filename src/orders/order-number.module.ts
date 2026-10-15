import { Module } from '@nestjs/common'

import { OrderNumberAllocator } from './order-number.allocator'

@Module({
  providers: [OrderNumberAllocator],
  exports: [OrderNumberAllocator],
})
export class OrderNumberModule {}
