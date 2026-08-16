import { Body, Controller, Post } from '@nestjs/common'

import { ValidateVatDto } from './dto/validate-vat.dto'
import { ViesService } from './vies.service'

/** Публічний ендпойнт — B2B checkout SK/EU (перевірка IČ DPH через VIES). */
@Controller('vies')
export class ViesController {
  constructor(private readonly vies: ViesService) {}

  @Post('validate')
  validate(@Body() dto: ValidateVatDto) {
    return this.vies.validateVat(dto.countryCode, dto.vatNumber)
  }
}
