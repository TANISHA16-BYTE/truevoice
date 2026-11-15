-- TrueVoice: additive Supabase schema compatibility repair
-- Safe to run on the existing TrueVoice Supabase project.
-- Does not drop, truncate, rename, or overwrite existing data.
-- Keeps archived flags as SMALLINT (0/1) to match the current SQLite code.

ALTER TABLE IF EXISTS public.facts
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE IF EXISTS public.prices
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS archived SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checked TEXT;

ALTER TABLE IF EXISTS public.offers
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS archived SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checked TEXT;

ALTER TABLE IF EXISTS public.claims
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS archived SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checked TEXT;

ALTER TABLE IF EXISTS public.terms
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS archived SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checked TEXT;

-- Query-path indexes used by the library and review queue.
CREATE INDEX IF NOT EXISTS idx_facts_status_product
  ON public.facts (status, product_code, fact_id);
CREATE INDEX IF NOT EXISTS idx_prices_archived_product
  ON public.prices (archived, product_code);
CREATE INDEX IF NOT EXISTS idx_offers_archived_code
  ON public.offers (archived, code);
CREATE INDEX IF NOT EXISTS idx_claims_archived_status
  ON public.claims (archived, status);
CREATE INDEX IF NOT EXISTS idx_terms_archived_category
  ON public.terms (archived, category);
CREATE INDEX IF NOT EXISTS idx_drafts_creator_created
  ON public.drafts (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_findings_draft_status
  ON public.findings (draft_id, status);
CREATE INDEX IF NOT EXISTS idx_history_draft_timestamp
  ON public.draft_history (draft_id, timestamp DESC);

-- Quick verification: these should return the newly aligned columns.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'facts' AND column_name IN ('owner', 'status')) OR
    (table_name IN ('prices', 'offers', 'claims', 'terms')
      AND column_name IN ('owner', 'archived', 'last_checked'))
  )
ORDER BY table_name, column_name;
