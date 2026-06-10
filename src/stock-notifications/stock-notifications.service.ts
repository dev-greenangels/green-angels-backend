import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { normalizePhoneE164 } from '../auth/auth.utils'
import { PrismaService } from '../prisma/prisma.service'
import { CreateStockNotificationDto } from './dto/create-stock-notification.dto'

const UKR_PHONE_ERROR =
  'Номер має починатися з +380 (ще 9 цифр) або з 0 (ще 9 цифр, разом 10)'

@Injectable()
export class StockNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeUkrPhone(raw: string): string {
    const phone = normalizePhoneE164(raw)
    if (!phone || !/^\+380\d{9}$/.test(phone)) {
      throw new BadRequestException(UKR_PHONE_ERROR)
    }
    return phone
  }

  async create(dto: CreateStockNotificationDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, isPublished: true },
      select: { id: true },
    })
    if (!product) {
      throw new NotFoundException('Товар не знайдено.')
    }

    const name = dto.name.trim()
    const email = dto.email?.trim().toLowerCase() || null
    const phone = dto.phone?.trim() ? this.normalizeUkrPhone(dto.phone) : null

    if (!email && !phone) {
      throw new BadRequestException('Вкажіть email або номер телефону.')
    }

    if (email) {
      const duplicateEmail = await this.prisma.productStockNotification.findFirst({
        where: { productId: dto.productId, notifiedAt: null, email },
        select: { id: true },
      })
      if (duplicateEmail) {
        return {
          ok: true as const,
          alreadySubscribed: true as const,
          id: duplicateEmail.id,
          message:
            'Ви вже підписані на сповіщення про цю рослину за цим email. Коли товар з’явиться на складі, ми повідомимо вас автоматично.',
        }
      }
    }

    if (phone) {
      const duplicatePhone = await this.prisma.productStockNotification.findFirst({
        where: { productId: dto.productId, notifiedAt: null, phone },
        select: { id: true },
      })
      if (duplicatePhone) {
        return {
          ok: true as const,
          alreadySubscribed: true as const,
          id: duplicatePhone.id,
          message:
            'Ви вже підписані на сповіщення про цю рослину за цим номером телефону. Коли товар з’явиться на складі, ми повідомимо вас автоматично.',
        }
      }
    }

    const created = await this.prisma.productStockNotification.create({
      data: {
        productId: dto.productId,
        name,
        email,
        phone,
      },
      select: { id: true },
    })

    return {
      ok: true as const,
      alreadySubscribed: false as const,
      id: created.id,
      message:
        'Дякуємо! Заявку збережено. Коли товар з’явиться на складі, ми повідомимо вас автоматично.',
    }
  }
}
