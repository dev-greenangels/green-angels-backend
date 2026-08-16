import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import {
  buildBlogExcerpt,
  resolveBlogAuthor,
  sanitizeBlogAuthor,
} from './blog.utils'
import { BlogBulkAction, BlogBulkDto } from './dto/blog-bulk.dto'
import { BlogPublishedFilter, BlogQueryDto, BlogSortOrder } from './dto/blog-query.dto'
import { CreateBlogPostDto } from './dto/create-blog-post.dto'
import { UpdateBlogPostDto } from './dto/update-blog-post.dto'

export type BlogPostListItem = {
  id: string
  slug: string
  title: string
  excerpt: string
  image: string | null
  author: string
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export type BlogPostDetail = BlogPostListItem & {
  content: string
  metaTitle: string | null
  metaDescription: string | null
  metaKeywords: string | null
}

export type BlogPostsPageResult = {
  items: BlogPostListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

type BlogPostRecord = {
  id: string
  slug: string
  title: string
  content: string
  excerpt: string | null
  image: string | null
  author: string | null
  metaTitle: string | null
  metaDescription: string | null
  metaKeywords: string | null
  isPublished: boolean
  createdAt: Date
  updatedAt: Date
}

const DEFAULT_PAGE_SIZE = 12

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeSlug(slug: string): string {
    return slug.trim().toLowerCase()
  }

  private normalizeImage(image?: string | null): string | null {
    if (image === undefined || image === null) return null
    const trimmed = image.trim()
    return trimmed || null
  }

  private toListItem(post: BlogPostRecord): BlogPostListItem {
    const excerpt = post.excerpt?.trim() || buildBlogExcerpt(post.content)
    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt,
      image: post.image,
      author: resolveBlogAuthor(post.author),
      isPublished: post.isPublished,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    }
  }

  private toDetail(post: BlogPostRecord): BlogPostDetail {
    return {
      ...this.toListItem(post),
      content: post.content,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      metaKeywords: post.metaKeywords,
    }
  }

  private resolvePagination(query: BlogQueryDto) {
    const page = query.page ?? 1
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, 100)
    return { page, pageSize, skip: (page - 1) * pageSize }
  }

  private buildWhere(query: BlogQueryDto, forcePublished: boolean): Prisma.BlogPostWhereInput {
    const where: Prisma.BlogPostWhereInput = {}

    if (forcePublished || query.publishedOnly === true) {
      where.isPublished = true
    } else if (query.status === BlogPublishedFilter.PUBLISHED) {
      where.isPublished = true
    } else if (query.status === BlogPublishedFilter.HIDDEN) {
      where.isPublished = false
    }

    const q = query.q?.trim()
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { author: { contains: q, mode: 'insensitive' } },
      ]
    }

    return where
  }

  async findPage(query: BlogQueryDto = {}, forcePublished = false): Promise<BlogPostsPageResult> {
    const where = this.buildWhere(query, forcePublished)
    const { page, pageSize, skip } = this.resolvePagination(query)
    const orderBy = {
      createdAt: query.sort === BlogSortOrder.OLDEST ? ('asc' as const) : ('desc' as const),
    }

    const [total, posts] = await Promise.all([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
      }),
    ])

    return {
      items: posts.map((post) => this.toListItem(post)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }

  /** @deprecated використовуйте findPage — лишається для сумісності. */
  async findAll(): Promise<BlogPostListItem[]> {
    const page = await this.findPage({ page: 1, pageSize: 100 }, true)
    return page.items
  }

  async findBySlug(slug: string, publishedOnly = true): Promise<BlogPostDetail> {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug: this.normalizeSlug(slug) },
    })
    if (!post || (publishedOnly && !post.isPublished)) {
      throw new NotFoundException('Статтю не знайдено.')
    }
    return this.toDetail(post)
  }

  async findById(id: string): Promise<BlogPostDetail> {
    const post = await this.prisma.blogPost.findUnique({ where: { id } })
    if (!post) {
      throw new NotFoundException('Статтю не знайдено.')
    }
    return this.toDetail(post)
  }

  async create(dto: CreateBlogPostDto): Promise<BlogPostDetail> {
    const slug = this.normalizeSlug(dto.slug)
    const existing = await this.prisma.blogPost.findUnique({ where: { slug } })
    if (existing) {
      throw new ConflictException('Стаття з таким slug вже існує.')
    }

    const post = await this.prisma.blogPost.create({
      data: {
        title: dto.title.trim(),
        slug,
        content: dto.content.trim(),
        excerpt: dto.excerpt?.trim() || null,
        image: this.normalizeImage(dto.image),
        author: sanitizeBlogAuthor(dto.author),
        metaTitle: dto.metaTitle?.trim() || null,
        metaDescription: dto.metaDescription?.trim() || null,
        metaKeywords: dto.metaKeywords?.trim() || null,
        isPublished: dto.isPublished ?? true,
      },
    })

    return this.toDetail(post)
  }

  async update(id: string, dto: UpdateBlogPostDto): Promise<BlogPostDetail> {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } })
    if (!existing) {
      throw new NotFoundException('Статтю не знайдено.')
    }

    if (dto.slug !== undefined) {
      const slug = this.normalizeSlug(dto.slug)
      const slugTaken = await this.prisma.blogPost.findFirst({
        where: { slug, NOT: { id } },
      })
      if (slugTaken) {
        throw new ConflictException('Стаття з таким slug вже існує.')
      }
    }

    const post = await this.prisma.blogPost.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.slug !== undefined ? { slug: this.normalizeSlug(dto.slug) } : {}),
        ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        ...(dto.excerpt !== undefined ? { excerpt: dto.excerpt?.trim() || null } : {}),
        ...(dto.image !== undefined ? { image: this.normalizeImage(dto.image) } : {}),
        ...(dto.author !== undefined ? { author: sanitizeBlogAuthor(dto.author) } : {}),
        ...(dto.metaTitle !== undefined ? { metaTitle: dto.metaTitle?.trim() || null } : {}),
        ...(dto.metaDescription !== undefined
          ? { metaDescription: dto.metaDescription?.trim() || null }
          : {}),
        ...(dto.metaKeywords !== undefined
          ? { metaKeywords: dto.metaKeywords?.trim() || null }
          : {}),
        ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
      },
    })

    return this.toDetail(post)
  }

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) {
      throw new NotFoundException('Статтю не знайдено.')
    }

    await this.prisma.blogPost.delete({ where: { id } })
    return { ok: true }
  }

  async bulk(dto: BlogBulkDto): Promise<{ ok: true; affected: number }> {
    const ids = [...new Set(dto.ids)]
    if (ids.length === 0) {
      throw new BadRequestException('Не обрано жодної статті.')
    }

    if (dto.action === BlogBulkAction.DELETE) {
      const result = await this.prisma.blogPost.deleteMany({ where: { id: { in: ids } } })
      return { ok: true, affected: result.count }
    }

    const isPublished = dto.action === BlogBulkAction.PUBLISH
    const result = await this.prisma.blogPost.updateMany({
      where: { id: { in: ids } },
      data: { isPublished },
    })
    return { ok: true, affected: result.count }
  }
}
