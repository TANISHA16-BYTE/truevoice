-- TrueVoice PostgreSQL / Supabase Migration
-- Run this in your Supabase SQL Editor if hosting on Supabase!

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('creator', 'reviewer', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  owner TEXT NOT NULL,
  last_verified_date DATE NOT NULL,
  validity_days INT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facts (
  fact_id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  source_id TEXT REFERENCES sources(source_id),
  verified_date DATE
);

CREATE TABLE IF NOT EXISTS prices (
  price_id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  current_price_inr INT NOT NULL,
  old_price_inr INT,
  effective_date DATE NOT NULL,
  source_id TEXT REFERENCES sources(source_id)
);

CREATE TABLE IF NOT EXISTS offers (
  offer_id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  discount_pct INT NOT NULL,
  applies_to TEXT NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  max_discount_inr INT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  claim_id TEXT PRIMARY KEY,
  claim_text TEXT NOT NULL,
  status TEXT NOT NULL,
  applies_to TEXT NOT NULL,
  required_evidence TEXT,
  source_id TEXT,
  rule_ref TEXT,
  safe_alternative TEXT
);

CREATE TABLE IF NOT EXISTS terms (
  term_id TEXT PRIMARY KEY,
  term TEXT NOT NULL,
  category TEXT NOT NULL,
  replacement TEXT NOT NULL,
  reason TEXT NOT NULL,
  rule_ref TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rules (
  rule_id TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  source_id TEXT REFERENCES sources(source_id)
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  post_id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  product TEXT NOT NULL,
  summary TEXT NOT NULL,
  launch_date_mentioned DATE,
  price_mentioned_inr INT,
  offer_mentioned TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS protected_names (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  owner TEXT NOT NULL,
  lookalike_keywords TEXT NOT NULL,
  risk_note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS regional_notes (
  id TEXT PRIMARY KEY,
  phrase TEXT NOT NULL,
  meaning TEXT NOT NULL,
  context TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  suggested_action TEXT NOT NULL,
  notes TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_mistakes (
  id TEXT PRIMARY KEY,
  phrase TEXT NOT NULL,
  region TEXT NOT NULL,
  incorrect_flag TEXT NOT NULL,
  user_correction TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  original_content TEXT NOT NULL,
  channel TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  product_code TEXT,
  creator_id TEXT NOT NULL,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  risk_level TEXT NOT NULL DEFAULT 'LOW',
  handover_to_manager BOOLEAN NOT NULL DEFAULT FALSE,
  manager_handover_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  flagged_text TEXT NOT NULL,
  rule_ref TEXT,
  source_id TEXT,
  reason TEXT NOT NULL,
  suggested_fix TEXT,
  confidence FLOAT DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'pending',
  creator_explanation TEXT,
  dismiss_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_badges (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  badge_code TEXT UNIQUE NOT NULL,
  content_hash TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  public_url TEXT NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  snapshot_content TEXT NOT NULL,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS draft_history (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
