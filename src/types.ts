// TypeScript Types for TrueVoice
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type FindingSeverity = "LOW" | "MEDIUM" | "HIGH";
export type FindingStatus = "pending" | "accepted" | "dismissed" | "explained";
export type DraftStatus = "draft" | "submitted" | "in_review" | "changes_requested" | "approved" | "rejected";
export type UserRole = "creator" | "reviewer" | "admin";

export interface Finding {
  id: string;
  type: string;
  severity: FindingSeverity;
  flagged_text: string;
  rule_ref?: string;
  source_id?: string;
  reason: string;
  suggested_fix?: string;
  confidence: number;
  status: FindingStatus;
  creator_explanation?: string;
  dismiss_reason?: string;
  stale_warning?: string;
}

export interface CheckResult {
  risk_level: RiskLevel;
  findings_count: number;
  findings: Finding[];
  summary: {
    high_severity_count: number;
    medium_severity_count: number;
    low_severity_count: number;
    unverified_count: number;
  };
}

export interface Draft {
  id: string;
  title: string;
  content: string;
  original_content: string;
  channel: string;
  scheduled_for?: string;
  product_code?: string;
  creator_id: string;
  status: DraftStatus;
  risk_level: RiskLevel;
  handover_to_manager: number;
  manager_handover_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovalBadge {
  id: string;
  draft_id: string;
  badge_code: string;
  content_hash: string;
  approved_by: string;
  reviewer_name: string;
  approved_at: string;
  public_url: string;
  snapshot_content: string;
}

export interface GuidelineHealth {
  health_score: number;
  status: "HEALTHY" | "NEEDS_ATTENTION" | "AT_RISK";
  problematic_rules_count: number;
  most_flagged_rules: Array<{
    rule_ref: string;
    title: string;
    section: string;
    total_flagged: number;
    override_count: number;
    override_rate_pct: number;
    is_unclear: boolean;
    suggested_action: string;
  }>;
  calculated_at: string;
}
