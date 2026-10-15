-- Yearly order numbers (ZY-YYYYNNNN) + OrderNumberCounter (Expand / B′).
-- Creates counter + bootstraps from MAX/sequence; KEEPS PostgreSQL SERIAL default
-- so old backends can still insert without an explicit orderNumber during Coolify cutover.
-- Idempotent UPSERT via GREATEST. Does NOT DROP DEFAULT or DROP SEQUENCE.

CREATE TABLE "OrderNumberCounter" (
    "year" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL,
    CONSTRAINT "OrderNumberCounter_pkey" PRIMARY KEY ("year")
);

DO $$
DECLARE
  seq_name text;
  max_order int;
  seq_last bigint := 0;
  current_year int;
  yearly_floor int;
  yearly_cap int;
  max_in_year int;
  init_seq int;
  legacy_ceiling int;
BEGIN
  seq_name := pg_get_serial_sequence('"Order"', 'orderNumber');

  SELECT COALESCE(MAX("orderNumber"), 0) INTO max_order FROM "Order";

  -- PostgreSQL: when is_called=false, last_value is the *next* value to issue
  -- (not yet issued). Use issued high-water only.
  IF seq_name IS NOT NULL THEN
    EXECUTE format(
      'SELECT CASE WHEN is_called THEN last_value ELSE GREATEST(last_value - 1, 0) END FROM %s',
      seq_name
    ) INTO seq_last;
  END IF;

  -- Dual deploy uses separate DBs; Bratislava year is correct for SK/EU.
  -- UA near NYE: short maintenance window if Kyiv year differs (documented in release plan).
  current_year := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Europe/Bratislava'))::int;
  yearly_floor := current_year * 10000;
  yearly_cap := yearly_floor + 9999;

  SELECT COALESCE(MAX("orderNumber"), 0) INTO max_in_year
  FROM "Order"
  WHERE "orderNumber" > yearly_floor AND "orderNumber" <= yearly_cap;

  IF max_in_year > 0 THEN
    init_seq := max_in_year % 10000;
    IF init_seq < 1 OR init_seq > 9999 THEN
      RAISE EXCEPTION
        'OrderNumberCounter bootstrap ambiguous: max_in_year=% for year %',
        max_in_year, current_year;
    END IF;
  ELSE
    legacy_ceiling := GREATEST(max_order, seq_last::int);
    IF legacy_ceiling >= yearly_floor AND legacy_ceiling <= yearly_cap THEN
      init_seq := legacy_ceiling % 10000;
    ELSIF legacy_ceiling >= 20260001
          AND (legacy_ceiling / 10000) BETWEEN 2026 AND 2100
          AND (legacy_ceiling % 10000) BETWEEN 1 AND 9999 THEN
      -- Prior/other yearly encoding only — new year starts at 0.
      init_seq := 0;
    ELSIF legacy_ceiling > 9999 THEN
      RAISE EXCEPTION
        'Cannot bootstrap OrderNumberCounter for %: legacy/sequence ceiling % exceeds 9999',
        current_year, legacy_ceiling;
    ELSE
      init_seq := legacy_ceiling;
    END IF;
  END IF;

  INSERT INTO "OrderNumberCounter" ("year", "lastSeq")
  VALUES (current_year, init_seq)
  ON CONFLICT ("year") DO UPDATE
  SET "lastSeq" = GREATEST("OrderNumberCounter"."lastSeq", EXCLUDED."lastSeq");

  -- Any other years that already have YYYYNNNN rows (partial / re-run safe).
  INSERT INTO "OrderNumberCounter" ("year", "lastSeq")
  SELECT
    ("orderNumber" / 10000)::int AS y,
    MAX(("orderNumber" % 10000))::int AS seq
  FROM "Order"
  WHERE "orderNumber" >= 20260001
    AND ("orderNumber" / 10000) BETWEEN 2026 AND 2100
    AND ("orderNumber" % 10000) BETWEEN 1 AND 9999
  GROUP BY 1
  ON CONFLICT ("year") DO UPDATE
  SET "lastSeq" = GREATEST("OrderNumberCounter"."lastSeq", EXCLUDED."lastSeq");
END $$;
