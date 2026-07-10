CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_latinName_trgm_idx"
  ON "Product" USING gin ("latinName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Product_slug_trgm_idx"
  ON "Product" USING gin (slug gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ProductTranslation_name_trgm_idx"
  ON "ProductTranslation" USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "CategoryTranslation_name_trgm_idx"
  ON "CategoryTranslation" USING gin (name gin_trgm_ops);
