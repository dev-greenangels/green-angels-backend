/**
 * Pre-launch: overwrite COOKIES Version 1 in place for sk/en/hu/de/cs/uk.
 * Does NOT create Version 2. Does not touch TERMS / PRIVACY / RETURNS.
 *
 * Usage: npx tsx scripts/cookies-v1-production-upsert.ts
 */
import { createHash } from 'crypto'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import {
  LegalDocumentType,
  LegalRevisionStatus,
  PrismaClient,
} from '@prisma/client'
import { COOKIES_PRODUCTION_V1 } from '../src/legal/cookies-production-v1/content'

const prisma = new PrismaClient()

function hashContent(locale: string, title: string, intro: string, content: string) {
  return createHash('sha256')
    .update(`${locale}\n${title}\n${intro}\n${content}`)
    .digest('hex')
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = resolve(__dirname, `../backups/legal/cookies-v1-pre-upsert-${stamp}`)
  mkdirSync(backupDir, { recursive: true })

  const document = await prisma.legalDocument.findUnique({
    where: { type: LegalDocumentType.COOKIES },
  })
  if (!document) {
    throw new Error('COOKIES LegalDocument row missing — seed the legal module first')
  }

  const before = await prisma.legalDocumentRevision.findMany({
    where: { documentId: document.id },
    orderBy: [{ locale: 'asc' }, { version: 'asc' }],
  })
  writeFileSync(
    `${backupDir}/before-index.json`,
    JSON.stringify(
      before.map((r) => ({
        id: r.id,
        locale: r.locale,
        version: r.version,
        status: r.status,
        title: r.title,
        publishedAt: r.publishedAt,
        contentHash: r.contentHash,
      })),
      null,
      2,
    ),
  )

  const now = new Date()
  const results: Array<Record<string, unknown>> = []

  for (const entry of COOKIES_PRODUCTION_V1) {
    const content = JSON.stringify(entry.sections)
    const contentHash = hashContent(entry.locale, entry.title, entry.intro, content)
    const existing = await prisma.legalDocumentRevision.findFirst({
      where: {
        documentId: document.id,
        locale: entry.locale,
        version: 1,
      },
    })

    if (existing) {
      const updated = await prisma.legalDocumentRevision.update({
        where: { id: existing.id },
        data: {
          title: entry.title,
          intro: entry.intro,
          content,
          contentHash,
          status: LegalRevisionStatus.PUBLISHED,
          publishedAt: existing.publishedAt ?? now,
          effectiveAt: existing.effectiveAt ?? now,
        },
      })
      results.push({
        action: 'UPDATE',
        locale: entry.locale,
        version: updated.version,
        id: updated.id,
        status: updated.status,
        publishedAt: updated.publishedAt?.toISOString() ?? null,
        contentHash: updated.contentHash,
      })
      continue
    }

    const created = await prisma.legalDocumentRevision.create({
      data: {
        documentId: document.id,
        locale: entry.locale,
        version: 1,
        title: entry.title,
        intro: entry.intro,
        content,
        contentHash,
        status: LegalRevisionStatus.PUBLISHED,
        publishedAt: now,
        effectiveAt: now,
      },
    })
    results.push({
      action: 'CREATE',
      locale: entry.locale,
      version: created.version,
      id: created.id,
      status: created.status,
      publishedAt: created.publishedAt?.toISOString() ?? null,
      contentHash: created.contentHash,
    })
  }

  const after = await prisma.legalDocumentRevision.findMany({
    where: { documentId: document.id },
    orderBy: [{ locale: 'asc' }, { version: 'asc' }],
  })
  writeFileSync(
    `${backupDir}/after-index.json`,
    JSON.stringify(
      after.map((r) => ({
        id: r.id,
        locale: r.locale,
        version: r.version,
        status: r.status,
        title: r.title,
        publishedAt: r.publishedAt,
        contentHash: r.contentHash,
      })),
      null,
      2,
    ),
  )
  writeFileSync(`${backupDir}/upsert-results.json`, JSON.stringify(results, null, 2))

  console.log(
    JSON.stringify(
      {
        ok: true,
        backupDir,
        results,
        version2Count: after.filter((r) => r.version >= 2).length,
        versions: after.map((r) => `${r.locale}:v${r.version}:${r.status}`),
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
