# TrueVoice 🛡️
> **"Check it before you publish it. Every finding shows its source. A human decides."**

[![Status: Production-Ready](https://img.shields.io/badge/Status-Production--Ready-brightgreen.svg)]()
[![Precision: 100%](https://img.shields.io/badge/Precision-100%25-blue.svg)]()
[![Serious Issue Detection: 100%](https://img.shields.io/badge/Detection-100%25-success.svg)]()
[![Zero Backend Deps](https://img.shields.io/badge/Backend-Zero--NPM--Deps%20(SQLite)-orange.svg)]()

TrueVoice is a content safety workspace and compliance engine that verifies draft posts, ad copy, uploaded documents, packaging claims, pricing, and campaign schedules before they go live. It catches unapproved claims, outdated prices, expired promotional discounts, schedule clashes, and trademark collisions—linking every finding to verified company sources while keeping a human in the loop for every final decision.

Built by **Team DevVibe**:
- **Tanisha Jain** — Backend Developer & System Architecture
- **Riddhi Sharma** — Feature Developer (Clash checks, Feedback loop, Disclaimers, Multi-format upload)
- **Siddhi** — UI & Screen Developer (`truevoice-frontend`)
- **Nupur** — Testing, Accessibility & Demo Lead

---

## 🚀 Quickstart

### Prerequisites
- **Node.js 22+** (required for built-in `node:sqlite` in local mode)

### 1. Start the Backend (from repo root)
No `npm install` is required for local SQLite mode (`server.js` uses Node's built-in `node:http`, `node:sqlite`, and `node:crypto`).

```bash
# Optional: copy .env.example to .env and add GEMINI_API_KEY for LLM + PDF/image checks
npm start
# Backend API starts on http://localhost:8000 (auto-seeds demo data on startup)
```

### 2. Start the Frontend (`truevoice-frontend/`)
In a second terminal:
```bash
cd truevoice-frontend
npm install
npm run dev
# Frontend opens on http://localhost:3000
```
The Next.js 16 app proxies `/backend/*` requests to `TRUEVOICE_BACKEND_URL` (defaults to `http://localhost:8000`) via `truevoice-frontend/next.config.ts`.

### 3. Run Benchmark & Integration Tests (from repo root)
```bash
# 40-sentence compliance benchmark
npm run benchmark

# Full 32-test end-to-end API integration suite
npm test
```

---

## 📊 Benchmark & Integration Test Results

TrueVoice includes an automated 40-sentence benchmark suite (`tests/benchmark_40_sentences.js`) containing **30 planted real-world violations** and **10 clean sentences**:

| Metric | Round 1 Target | TrueVoice Result | Status |
|---|---|---|---|
| **Precision Rate** | >= 85% | **100%** (30 / 30) | ✅ Exceeded |
| **Serious Problem Detection** | >= 70% | **100%** | ✅ Exceeded |
| **Overall Detection Recall** | N/A | **100%** | ✅ All Caught |
| **False Positives (Clean Pass)** | 0 | **0 / 10** | ✅ 0 False Alarms |

`npm test` (`tests/api.test.js`) also passes **32 / 32** integration tests covering auth, unified library updates, file upload extraction, batch clash checks, handover, dismissal, cryptographic badges, tamper verification, guideline health analytics, and CSV audit export.

---

## 🔑 Demo Login Credentials (Local SQLite Mode)

Pre-configured in the seeded local database:

| Role | Email | Password | Permissions |
|---|---|---|---|
| **Creator** | `tanisha@glowvale.demo` | `creator123` | Submit drafts & uploads, run instant/batch checks, explain intent ("Why flagged?"), hand to manager, accept suggested fixes |
| **Reviewer** | `riddhi@glowvale.demo` | `reviewer123` | Review queue, dismiss findings with mandatory reason, approve/request changes, issue proof badges, edit library & rule wording |
| **Admin** | `manager@glowvale.demo` | `admin123` | Full reviewer/admin access, report AI mistakes, export regulatory audit logs |

---

## 🌟 Core Features & Modules

### 1. Exact-Match & AI Hybrid Compliance Engine (`src/services/checkPipeline.js`, `src/services/exactRulesEngine.js`, `src/services/aiCheckerService.js`)
- **Pricing Shield**: Catches outdated pricing (e.g., Daily Shield Sunscreen quoted at ₹499 instead of current ₹549 from Source `S-04`).
- **Campaign & Offer Verifier**: Prevents advertising expired campaigns (`DIWALI15` / `OFF-04`, expired 10 Nov 2026) and unapproved discount rates (flagging 30% off instead of approved 20% `WINTER20`).
- **Prohibited Efficacy Claims**: Flags banned claims such as *"clinically proven"*, *"removes wrinkles in days"*, *"100% natural / chemical-free"*, *"instant results"*, and *"cures acne"*.
- **The "Needs Source" Principle**: Claims without an approved study (e.g., *"suitable for sensitive skin"*) are marked **"Unverified, needs source"** instead of guessing.
- **Tone 1.3 Anti-Urgency**: Flags all-caps shouting and excessive exclamation marks (`"HURRY!!! BUY NOW!!!"`).
- **Resilient Fallback**: Uses Gemini when `GEMINI_API_KEY` is configured and automatically falls back to the deterministic local rules engine if Gemini is unavailable.

### 2. Multi-Format Draft Upload (`src/controllers/uploadController.js`)
- `POST /api/upload` extracts text directly from `.docx`, `.pptx` (slides + speaker notes), `.rtf`, `.txt`, `.md`, `.csv`, `.tsv`, `.json`, `.html`, `.xml`, and `.yml`.
- Supports `.pdf` and images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`) via Gemini multimodal extraction when `GEMINI_API_KEY` is set.

### 3. Trademark Shield ("Check, Don't Judge") (`src/services/trademarkShieldService.js`)
- Scans drafts against registered protected names (`Dewlite`, `GlowBoost`, `YouthShield`, `DermaPure`).
- Frames similarity warnings transparently as AI suggestions—never legal advice—and recommends legal team review.

### 4. Regional Nuance Guard & "Report AI Mistake" Loop (`src/services/regionalNuanceService.js`)
- Distinguishes harmful colorist language (*"Gora nikhaar"* -> flagged under Tone 1.2) from approved festive colloquialisms (*"Dhamaka offer"* -> allowed).
- **Human Learning Feedback Loop**: Reviewer corrections submitted via **Report AI Mistake** (`POST /api/ai-mistakes`) are persisted in `ai_mistakes` and respected in future checks.

### 5. Cross-Channel Schedule Clash Check (`src/services/scheduleClashService.js`)
- Scans single drafts and multi-channel batches (`POST /api/check/batch`) against scheduled posts across Instagram, Email, X (Twitter), Facebook, and LinkedIn.
- Flags launch-date drift (e.g., `P-01` launching 19 Nov vs official 20 Nov launch) and price mismatches (e.g., `P-03` quoting ₹499 vs ₹549).

### 6. Human-in-the-Loop Workflow & Manager Handover (`src/controllers/draftsController.js`)
- **One-Chance "Why Flagged?" Context**: Creators can add context once per finding or escalate directly via **Hand to Manager** (`POST /api/drafts/:id/handover`).
- **Reviewer Decisions & Dismissal Audit Trail**: Reviewers can **Approve**, **Request Changes**, or **Dismiss** individual findings with a mandatory recorded reason (`POST /api/drafts/:id/findings/:fid/dismiss`).
- **Regulatory Audit Export (`src/controllers/auditController.js`)**: Export full compliance audit trails as CSV or JSON (`GET /api/audit-logs/export`).

### 7. Cryptographic Proof-of-Approval Badge & Scannable QR (`src/services/approvalBadgeService.js`, `ProofOfApprovalBadge.tsx`)
- Upon approval, computes a deterministic SHA-256 fingerprint of the canonical approved text:
  `content_hash = sha256(normalizeContent(content))`
- Issues a unique verification code (`TV-APPR-XXXXXX`), saves an immutable content snapshot, and renders a scannable ISO 18004 QR code linking to the public `/verify/:code` page.
- **Tamper Detection (`POST /api/verify`)**: Anyone can paste live published text to verify whether it matches (`VERIFIED_AUTHENTIC`) or was altered after approval (`MODIFIED_TAMPERED`).

### 8. Guideline Health Score & Root-Cause Editing (`src/services/guidelineHealthService.js`)
- Computes a live health score out of 100 from review findings and reviewer dismissals/overrides.
- Automatically flags rules with **>= 5 flags and a >= 40% override rate** under **Needs clearer wording** so reviewers can edit the guideline wording directly from `/dashboard/health` or `/dashboard/library`.

### 9. Stale Knowledge Engine (`src/services/staleKnowledgeService.js`)
- Compares source verification dates against `DEMO_DATE` (`2026-11-13` by default).
- Surfaces stale/expired sources (e.g., Source `S-06` Cruelty-Free Certification, last verified 1 Oct 2025 with 365-day validity) across the Dashboard and Library so reviewers can refresh verification dates.

---

## 💻 Frontend Workspace (`truevoice-frontend/`)

Built with **Next.js 16**, **React 19**, **TypeScript**, and **Tailwind CSS**:
- `/login` & `/signup` — Role-aware authentication and quick demo role sign-in
- `/dashboard` — Workspace overview, draft stage tracker, and stale knowledge alerts
- `/dashboard/library` — Unified brand knowledge library with inline editing for reviewers
- `/dashboard/submit` — Live draft checker, multi-format file upload, multi-channel batch check, suggested fixes, "Why flagged?" context, Hand to Manager, and Report AI Mistake
- `/dashboard/review` — High-risk-first Review Queue, per-finding Dismiss with reason, Approve / Request Changes, and Proof-of-Approval badge + QR
- `/dashboard/health` — Live Guideline Health Score, most-flagged rules, and unclear rule editor
- `/verify/[code]` — Public Proof-of-Approval verification and paste-to-compare tamper check

---

## 📡 REST API Reference

### Docs, Health & Auth
- `GET /docs`, `GET /api/openapi.json` — Interactive Swagger UI & OpenAPI 3.0 spec
- `GET /api/health` — Server health & endpoint index
- `POST /api/auth/signup` — Create creator account (`{ name, email, password }`)
- `POST /api/auth/login` — User login (`{ email, password }`), returns JWT token
- `GET /api/auth/me` — Authenticated user profile

### Checking, Uploads & Drafts
- `POST /api/check` — Instant safety check on raw text (does not save a draft)
- `POST /api/check/batch` — Multi-channel batch check for cross-channel clashes
- `POST /api/upload` — Extract text from uploaded documents/images
- `POST /api/drafts` — Submit a draft, run full pipeline, and save findings
- `GET /api/drafts` — Review queue (sorted High Risk first)
- `GET /api/drafts/:id` — Draft details, findings, history timeline, and approval badge

### Creator & Reviewer Actions
- `POST /api/drafts/:id/findings/:fid/explain` — Creator's one-chance "Why flagged?" context
- `POST /api/drafts/:id/findings/:fid/accept` — Apply suggested fix to draft text
- `POST /api/drafts/:id/findings/:fid/dismiss` — Reviewer dismisses finding with mandatory reason
- `POST /api/drafts/:id/handover` — Creator hands finding/draft to a human manager
- `POST /api/drafts/:id/decision` — Unified reviewer decision (`approved` or `changes_requested`)
- `POST /api/drafts/:id/approve` — Reviewer approves draft & issues cryptographic badge
- `POST /api/drafts/:id/request-changes` — Reviewer requests edits with commentary

### Verification, Governance & Export
- `GET /api/verify/:badgeCode` — Public badge verification lookup
- `GET /api/verify/:badgeCode/qr` — Backend QR SVG endpoint
- `POST /api/verify` — Content integrity tamper check (`{ badge_code, content }`)
- `GET /api/health-score` / `GET /api/analytics/guideline-health` — Guideline Health Score & unclear rule alerts
- `POST /api/ai-mistakes` / `GET /api/ai-mistakes` — Submit & list learned regional corrections
- `GET /api/clash/posts` — Scheduled cross-channel posts
- `GET /api/audit-logs/export?format=csv|json` — Export regulatory audit log (Reviewer/Admin)

### Knowledge Library
- `GET /api/library` — Unified library payload (sources, facts, prices, offers, claims, terms, rules)
- `PATCH /api/library/:id` — Update source/rule fields (Reviewer/Admin)
- `GET /api/library/sources`, `/facts`, `/prices`, `/offers`, `/claims`, `/terms`, `/rules`, `/protected-names`, `/regional-notes`
- `POST/PUT/DELETE /api/library/facts|prices|offers|claims|terms` — Manage library items (Reviewer/Admin)

---

## 🗄️ Production Deployment (Supabase + Render + Vercel)

- **Database (Supabase PostgreSQL):** Run `src/db/supabase_migration.sql` in the Supabase SQL Editor to create all tables, foreign keys, and constraints. Use the **`migration/postgresql-supabase`** branch for PostgreSQL support (`npm install` installs `pg`, and `seed-postgres.js` seeds reference data without overwriting existing rows).
- **Backend (Render):** Deploy the root project from `migration/postgresql-supabase` with `DATABASE_URL`, `DATABASE_SSL=true`, `JWT_SECRET` (32+ chars), `NODE_ENV=production`, `BASE_URL`, and `GEMINI_API_KEY`.
- **Frontend (Vercel):** Deploy with **Root Directory** set to `truevoice-frontend` and environment variable `TRUEVOICE_BACKEND_URL` set to your Render backend URL.