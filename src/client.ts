// TrueVoice Frontend API Client SDK
import type { CheckResult, Draft, ApprovalBadge, GuidelineHealth } from "./types";

export class TrueVoiceClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = "http://localhost:8000") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> || {})
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  async login(email: string, password: string) {
    const data = await this.request<{ user: any; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    this.setToken(data.token);
    return data;
  }

  async checkContent(text: string, options: { title?: string; channel?: string; product_code?: string } = {}) {
    return this.request<CheckResult>("/api/check", {
      method: "POST",
      body: JSON.stringify({ text, ...options })
    });
  }

  async submitDraft(draft: { title: string; content: string; channel?: string; product_code?: string }) {
    return this.request<{ draft_id: string; risk_level: string; findings: any[] }>("/api/drafts", {
      method: "POST",
      body: JSON.stringify(draft)
    });
  }

  async getReviewQueue(params: { status?: string; risk_level?: string } = {}) {
    const qs = new URLSearchParams(params as any).toString();
    return this.request<{ drafts: Draft[] }>(`/api/drafts${qs ? "?" + qs : ""}`);
  }

  async getDraft(id: string) {
    return this.request<{ draft: Draft; findings: any[]; history: any[]; approval_badge: ApprovalBadge | null }>(`/api/drafts/${id}`);
  }

  async explainFinding(draftId: string, findingId: string, explanation: string) {
    return this.request(`/api/drafts/${draftId}/findings/${findingId}/explain`, {
      method: "POST",
      body: JSON.stringify({ explanation })
    });
  }

  async handoverToManager(draftId: string, reason: string) {
    return this.request(`/api/drafts/${draftId}/handover`, {
      method: "POST",
      body: JSON.stringify({ reason })
    });
  }

  async acceptFindingFix(draftId: string, findingId: string, customFix?: string) {
    return this.request(`/api/drafts/${draftId}/findings/${findingId}/accept`, {
      method: "POST",
      body: JSON.stringify({ custom_fix: customFix })
    });
  }

  async approveDraft(draftId: string) {
    return this.request<{ success: boolean; badge: ApprovalBadge }>(`/api/drafts/${draftId}/approve`, {
      method: "POST"
    });
  }

  async verifyContent(badgeCode: string, content?: string) {
    return this.request("/api/verify", {
      method: "POST",
      body: JSON.stringify({ badge_code: badgeCode, content })
    });
  }

  async getHealthScore() {
    return this.request<GuidelineHealth>("/api/health-score");
  }

  async reportAiMistake(phrase: string, userCorrection: string, region: string = "North India") {
    return this.request("/api/ai-mistakes", {
      method: "POST",
      body: JSON.stringify({ phrase, user_correction: userCorrection, region })
    });
  }
}
