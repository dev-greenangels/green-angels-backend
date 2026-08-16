-- URL тепер будується на льоту з relative_path; колонка url більше не потрібна
ALTER TABLE "photo_index" DROP COLUMN IF EXISTS "url";
