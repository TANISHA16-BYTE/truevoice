-- TrueVoice SQLite Relational Schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('creator', 'reviewer', 'admin')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  owner TEXT NOT NULL,
  last_verified_date TEXT NOT NULL,
  validity_days INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facts (
  fact_id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  source_id TEXT,
  verified_date TEXT
);

CREATE TABLE IF NOT EXISTS prices (
  price_id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  current_price_inr INTEGER NOT NULL,
  old_price_inr INTEGER,
  effective_date TEXT NOT NULL,
  source_id TEXT
);

CREATE TABLE IF NOT EXISTS offers (
  offer_id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  discount_pct INTEGER NOT NULL,
  applies_to TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  max_discount_inr INTEGER,
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
  source_id TEXT
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  post_id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  product TEXT NOT NULL,
  summary TEXT NOT NULL,
  launch_date_mentioned TEXT,
  price_mentioned_inr INTEGER,
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
  allowed INTEGER NOT NULL,
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
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  original_content TEXT NOT NULL,
  channel TEXT NOT NULL,
  scheduled_for TEXT,
  product_code TEXT,
  creator_id TEXT NOT NULL,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  risk_level TEXT NOT NULL DEFAULT 'LOW',
  handover_to_manager INTEGER NOT NULL DEFAULT 0,
  manager_handover_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  flagged_text TEXT NOT NULL,
  rule_ref TEXT,
  source_id TEXT,
  reason TEXT NOT NULL,
  suggested_fix TEXT,
  confidence REAL DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'pending',
  creator_explanation TEXT,
  dismiss_reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS approval_badges (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  badge_code TEXT UNIQUE NOT NULL,
  content_hash TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  public_url TEXT NOT NULL,
  is_revoked INTEGER NOT NULL DEFAULT 0,
  snapshot_content TEXT NOT NULL,
  metadata TEXT,
  FOREIGN KEY (draft_id) REFERENCES drafts(id)
);

CREATE TABLE IF NOT EXISTS draft_history (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE
);
