export type PrestaImportSettings = {
  /** Шаблон URL фото товару. Плейсхолдери: {id_image}, {link_rewrite} */
  productImageUrlTemplate: string
  /**
   * Шаблон URL обкладинки ST Blog.
   * Плейсхолдери: {id_blog}, {id_image} (або {id} = id_image для сумісності).
   */
  blogImageUrlTemplate: string
  /** Шаблон URL фото відгуку (productcomment). Плейсхолдери: {id_comment}, {id_image} */
  reviewImageUrlTemplate: string
}

export const DEFAULT_PRESTA_IMPORT_SETTINGS: PrestaImportSettings = {
  productImageUrlTemplate:
    'https://landshaft.info/{id_image}-thickbox_default/{link_rewrite}.jpg',
  blogImageUrlTemplate:
    'https://landshaft.info/upload/stblog/1/{id_blog}/{id_image}/{id_blog}{id_image}medium.jpg',
  reviewImageUrlTemplate:
    'https://landshaft.info/upload/productcomment/{id_comment}/{id_image}.jpg',
}

const LEGACY_BROKEN_BLOG_IMAGE_TEMPLATES = [
  'https://landshaft.info/modules/stblog/views/img/{id}.jpg',
  'https://landshaft.info/modules/stblog/views/img/{id_image}.jpg',
]

export function normalizePrestaImportSettings(raw: unknown): PrestaImportSettings {
  const value = raw && typeof raw === 'object' ? (raw as Partial<PrestaImportSettings>) : {}
  const product =
    typeof value.productImageUrlTemplate === 'string' && value.productImageUrlTemplate.trim()
      ? value.productImageUrlTemplate.trim()
      : DEFAULT_PRESTA_IMPORT_SETTINGS.productImageUrlTemplate

  let blog =
    typeof value.blogImageUrlTemplate === 'string' && value.blogImageUrlTemplate.trim()
      ? value.blogImageUrlTemplate.trim()
      : DEFAULT_PRESTA_IMPORT_SETTINGS.blogImageUrlTemplate

  if (
    LEGACY_BROKEN_BLOG_IMAGE_TEMPLATES.includes(blog) ||
    blog.includes('/modules/stblog/views/img/')
  ) {
    blog = DEFAULT_PRESTA_IMPORT_SETTINGS.blogImageUrlTemplate
  }

  const review =
    typeof value.reviewImageUrlTemplate === 'string' && value.reviewImageUrlTemplate.trim()
      ? value.reviewImageUrlTemplate.trim()
      : DEFAULT_PRESTA_IMPORT_SETTINGS.reviewImageUrlTemplate

  return {
    productImageUrlTemplate: product,
    blogImageUrlTemplate: blog,
    reviewImageUrlTemplate: review,
  }
}
