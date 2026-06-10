import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { CATEGORY_DEFAULT_IMAGE } from './category.constants'
import { CreateCategoryDto } from './dto/create-category.dto'
import { UpdateCategoryDto } from './dto/update-category.dto'

export type CategoryTreeNode = {
  id: string
  slug: string
  parentId: string | null
  legacyId: number | null
  isActive: boolean
  position: number
  name: string
  description: string | null
  image: string | null
  imageUrl: string
  metaTitle: string | null
  metaDesc: string | null
  productCount: number
  children: CategoryTreeNode[]
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private defaultLocale(locale?: string) {
    return (locale?.trim() || 'uk').toLowerCase()
  }

  resolveImageUrl(image: string | null | undefined): string {
    const trimmed = image?.trim()
    return trimmed || CATEGORY_DEFAULT_IMAGE
  }

  private normalizeImageInput(image?: string | null): string | null {
    if (image === undefined) return null
    if (image === null) return null
    const trimmed = image.trim()
    return trimmed || null
  }

  private toFlatCategory(
    category: {
      id: string
      slug: string
      parentId: string | null
      legacyId: number | null
      isActive: boolean
      position: number
      image: string | null
      translations: Array<{
        name: string
        description: string | null
        metaTitle: string | null
        metaDesc: string | null
      }>
      _count: { products: number }
    },
    slugFallback?: string,
  ) {
    const t = category.translations[0]
    return {
      id: category.id,
      slug: category.slug,
      parentId: category.parentId,
      legacyId: category.legacyId,
      isActive: category.isActive,
      position: category.position,
      name: t?.name ?? slugFallback ?? category.slug,
      description: t?.description ?? null,
      image: category.image,
      imageUrl: this.resolveImageUrl(category.image),
      metaTitle: t?.metaTitle ?? null,
      metaDesc: t?.metaDesc ?? null,
      productCount: category._count.products,
    }
  }

  async findTree(locale?: string): Promise<CategoryTreeNode[]> {
    const loc = this.defaultLocale(locale)
    const rows = await this.prisma.category.findMany({
      include: {
        translations: { where: { locale: loc } },
        _count: { select: { products: true, children: true } },
      },
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }, { slug: 'asc' }],
    })

    const nodes = new Map<string, CategoryTreeNode>()
    for (const row of rows) {
      const flat = this.toFlatCategory(row)
      nodes.set(row.id, { ...flat, children: [] })
    }

    const roots: CategoryTreeNode[] = []
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)!.children.push(node)
      } else if (!node.parentId) {
        roots.push(node)
      }
    }

    const sortNodes = (list: CategoryTreeNode[]) => {
      list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'uk'))
      list.forEach((n) => sortNodes(n.children))
    }
    sortNodes(roots)

    return roots
  }

  async create(dto: CreateCategoryDto) {
    const locale = this.defaultLocale(dto.locale)
    const slug = dto.slug.trim().toLowerCase()

    const slugTaken = await this.prisma.category.findUnique({ where: { slug } })
    if (slugTaken) {
      throw new ConflictException('Категорія з таким slug вже існує.')
    }

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } })
      if (!parent) {
        throw new NotFoundException('Батьківську категорію не знайдено.')
      }
    }

    if (dto.legacyId !== undefined) {
      const legacyTaken = await this.prisma.category.findUnique({
        where: { legacyId: dto.legacyId },
      })
      if (legacyTaken) {
        throw new ConflictException('Категорія з таким legacyId вже існує.')
      }
    }

    const category = await this.prisma.category.create({
      data: {
        slug,
        image: this.normalizeImageInput(dto.image),
        parentId: dto.parentId ?? null,
        legacyId: dto.legacyId ?? null,
        isActive: dto.isActive ?? true,
        position: dto.position ?? 0,
        translations: {
          create: {
            locale,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            metaTitle: dto.metaTitle?.trim() || null,
            metaDesc: dto.metaDesc?.trim() || null,
          },
        },
      },
      include: {
        translations: { where: { locale } },
        _count: { select: { products: true } },
      },
    })

    return this.toFlatCategory(category, category.slug)
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const locale = this.defaultLocale(dto.locale)
    const existing = await this.prisma.category.findUnique({
      where: { id },
      include: { translations: { where: { locale } } },
    })
    if (!existing) {
      throw new NotFoundException('Категорію не знайдено.')
    }

    if (dto.slug) {
      const slug = dto.slug.trim().toLowerCase()
      const conflict = await this.prisma.category.findFirst({
        where: { slug, NOT: { id } },
      })
      if (conflict) {
        throw new ConflictException('Категорія з таким slug вже існує.')
      }
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('Категорія не може бути підкатегорією самої себе.')
      }
      if (dto.parentId) {
        const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } })
        if (!parent) {
          throw new NotFoundException('Батьківську категорію не знайдено.')
        }
        if (await this.isDescendant(id, dto.parentId)) {
          throw new BadRequestException('Неможливо перенести категорію в її підкатегорію.')
        }
      }
    }

    if (dto.legacyId !== undefined) {
      const legacyConflict = await this.prisma.category.findFirst({
        where: { legacyId: dto.legacyId, NOT: { id } },
      })
      if (legacyConflict) {
        throw new ConflictException('Категорія з таким legacyId вже існує.')
      }
    }

    const category = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data: {
          ...(dto.slug ? { slug: dto.slug.trim().toLowerCase() } : {}),
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
          ...(dto.image !== undefined ? { image: this.normalizeImageInput(dto.image) } : {}),
          ...(dto.legacyId !== undefined ? { legacyId: dto.legacyId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
        },
      })

      const translation = existing.translations[0]
      const name = dto.name?.trim() ?? translation?.name
      const metaTitle =
        dto.metaTitle !== undefined ? dto.metaTitle.trim() || null : translation?.metaTitle ?? null
      const metaDesc =
        dto.metaDesc !== undefined ? dto.metaDesc.trim() || null : translation?.metaDesc ?? null
      const description =
        dto.description !== undefined
          ? dto.description.trim() || null
          : translation?.description ?? null

      if (name) {
        if (translation) {
          await tx.categoryTranslation.update({
            where: { id: translation.id },
            data: { name, description, metaTitle, metaDesc },
          })
        } else {
          await tx.categoryTranslation.create({
            data: {
              categoryId: id,
              locale,
              name,
              description,
              metaTitle,
              metaDesc,
            },
          })
        }
      }

      return updated
    })

    const refreshed = await this.prisma.category.findUnique({
      where: { id: category.id },
      include: {
        translations: { where: { locale } },
        _count: { select: { products: true } },
      },
    })

    return this.toFlatCategory(refreshed!, refreshed!.slug)
  }

  async remove(id: string) {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { children: true, products: true } },
      },
    })
    if (!existing) {
      throw new NotFoundException('Категорію не знайдено.')
    }
    if (existing._count.children > 0) {
      throw new BadRequestException('Спочатку видаліть або перенесіть підкатегорії.')
    }
    if (existing._count.products > 0) {
      throw new BadRequestException('Категорія містить товари. Перенесіть їх перед видаленням.')
    }

    await this.prisma.category.delete({ where: { id } })
    return { ok: true }
  }

  private async isDescendant(ancestorId: string, maybeDescendantId: string): Promise<boolean> {
    let currentId: string | null = maybeDescendantId
    const visited = new Set<string>()

    while (currentId) {
      if (currentId === ancestorId) return true
      if (visited.has(currentId)) break
      visited.add(currentId)

      const row: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      })
      currentId = row?.parentId ?? null
    }

    return false
  }
}
