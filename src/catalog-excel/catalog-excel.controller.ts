import { BadRequestException, Controller, Get, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Role } from '@prisma/client'
import type { Response } from 'express'
import { memoryStorage } from 'multer'

import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { parseTemplateMode, parseTemplateSheets } from './catalog-excel.constants'
import { CatalogExcelService } from './catalog-excel.service'

const TEMPLATE_FILENAME = 'catalog-import-template.xlsx'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

@Controller('catalog-excel')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class CatalogExcelController {
  constructor(private readonly catalogExcel: CatalogExcelService) {}

  @Get('template')
  async downloadTemplate(
    @Res() res: Response,
    @Query('mode') modeRaw?: string,
    @Query('sheets') sheetsRaw?: string,
  ) {
    const mode = parseTemplateMode(modeRaw)
    const sheets = parseTemplateSheets(sheetsRaw)
    const buffer = await this.catalogExcel.buildTemplate(mode, sheets)
    const filename =
      mode === 'export' ? 'catalog-export.xlsx' : TEMPLATE_FILENAME
    res.setHeader('Content-Type', XLSX_MIME)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', String(buffer.length))
    res.send(buffer)
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 30 * 1024 * 1024 },
    }),
  )
  async importExcel(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Файл не передано')
    }
    return this.catalogExcel.importWorkbook(file.buffer)
  }
}
