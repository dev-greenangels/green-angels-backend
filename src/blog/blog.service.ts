import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { buildBlogExcerpt } from './blog.utils'
import { CreateBlogPostDto } from './dto/create-blog-post.dto'
import { UpdateBlogPostDto } from './dto/update-blog-post.dto'

export type BlogPostListItem = {
  id: string
  slug: string
  title: string
  excerpt: string
  image: string | null
  createdAt: string
  updatedAt: string
}

export type BlogPostDetail = BlogPostListItem & {
  content: string
}

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

  private toListItem(post: {
    id: string
    slug: string
    title: string
    content: string
    image: string | null
    createdAt: Date
    updatedAt: Date
  }): BlogPostListItem {
    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: buildBlogExcerpt(post.content),
      image: post.image,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    }
  }

  private toDetail(post: {
    id: string
    slug: string
    title: string
    content: string
    image: string | null
    createdAt: Date
    updatedAt: Date
  }): BlogPostDetail {
    return {
      ...this.toListItem(post),
      content: post.content,
    }
  }

  async findAll(): Promise<BlogPostListItem[]> {
    const posts = await this.prisma.blogPost.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return posts.map((post) => this.toListItem(post))
  }

  async findBySlug(slug: string): Promise<BlogPostDetail> {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug: this.normalizeSlug(slug) },
    })
    if (!post) {
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
        image: this.normalizeImage(dto.image),
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
        ...(dto.image !== undefined ? { image: this.normalizeImage(dto.image) } : {}),
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
}
