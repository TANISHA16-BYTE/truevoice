"use client";

import { useState } from "react";

type DemoRole = "creator" | "reviewer" | "admin";
const ROLE_ORDER: DemoRole[] = ["creator", "reviewer", "admin"];

const DEMO_USERS: Record<DemoRole, { label: string; email: string; password: string }> = {
  creator: { label: "Creator", email: "creator@demo.truevoice", password: "demo-password" },
  reviewer: { label: "Reviewer", email: "riddhi@demo.truevoice", password: "demo-password" },
  admin: { label: "Admin", email: "admin@demo.truevoice", password: "demo-password" },
};

interface Option2LoginProps {
  onLogin: (email: string, password: string) => Promise<void> | void;
}

export function Option2Login({ onLogin }: Option2LoginProps) {
  const [selectedRole, setSelectedRole] = useState<DemoRole>("reviewer");
  const [email, setEmail] = useState(DEMO_USERS.reviewer.email);
  const [password, setPassword] = useState(DEMO_USERS.reviewer.password);
  const [loading, setLoading] = useState(false);

  const roleIndex = ROLE_ORDER.indexOf(selectedRole);

  const handleRolePick = (role: DemoRole) => {
    setSelectedRole(role);
    setEmail(DEMO_USERS[role].email);
    setPassword(DEMO_USERS[role].password);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onLogin(email, password);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#2E0B17] via-[#4D1627] to-[#240711] px-4 py-12">
      {/* Floating ambient demo cards */}
      <div className="animate-float-slow pointer-events-none absolute left-[8%] top-[22%] hidden max-w-xs rounded-2xl border border-white/15 bg-white/10 p-4 text-xs text-[#FAF6EE] backdrop-blur-md lg:block">
        <p className="font-semibold text-[#E8D7BC]">Exact Rule Catch</p>
        <p className="mt-1 opacity-90">
          <span className="line-through opacity-60">flat 30% off</span> →{" "}
          <span className="font-semibold text-emerald-300">Flat 20% off</span>
        </p>
        <p className="mt-1 text-[11px] opacity-70">Source: Approved Offer Sheet (20–30 Nov)</p>
      </div>

      <div className="animate-float-slow-reverse pointer-events-none absolute bottom-[18%] right-[8%] hidden max-w-xs rounded-2xl border border-white/15 bg-white/10 p-4 text-xs text-[#FAF6EE] backdrop-blur-md lg:block">
        <p className="font-semibold text-[#E8D7BC]">Cross-Channel Clash</p>
        <p className="mt-1 opacity-90">Draft says Friday 20 Nov · IG post scheduled Thu 19 Nov</p>
      </div>

      {/* Main Card */}
      <div className="animate-fade-up relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-[#FAF6EE]">
          <svg className="h-7 w-7 text-[#E8D7BC]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <span className="font-serif text-2xl font-bold">TrueVoice</span>
        </div>

        <div className="rounded-3xl border border-[#E8D7BC]/30 bg-[#FAF6EE] p-8 shadow-2xl">
          <h1 className="font-serif text-2xl font-bold text-[#2E0B17]">Log in</h1>
          <p className="mt-1 text-sm text-[#5E4B51]">
            Every finding shows its source. A human decides.
          </p>

          {/* Pure CSS Sliding Pill Tabs */}
          <div className="mt-5">
            <span className="mb-1.5 block text-xs font-medium text-[#5E4B51]">
              Demo accounts (made-up data):
            </span>
            <div className="relative grid grid-cols-3 rounded-xl bg-[#EDE4D3] p-1">
              <span
                aria-hidden="true"
                className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-[#4D1627] shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none"
                style={{ transform: `translateX(${roleIndex * 100}%)` }}
              />
              {ROLE_ORDER.map((role) => {
                const active = selectedRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleRolePick(role)}
                    className={`relative z-10 rounded-lg py-1.5 text-xs font-semibold transition-colors duration-200 ${
                      active ? "text-[#FAF6EE]" : "text-[#4D1627] hover:text-[#2E0B17]"
                    }`}
                  >
                    {DEMO_USERS[role].label}
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-[#2E0B17]">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D9CEB8] bg-white px-3.5 py-2.5 text-sm text-[#2E0B17] outline-none transition focus:border-[#4D1627] focus:ring-2 focus:ring-[#4D1627]/15"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-[#2E0B17]">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D9CEB8] bg-white px-3.5 py-2.5 text-sm text-[#2E0B17] outline-none transition focus:border-[#4D1627] focus:ring-2 focus:ring-[#4D1627]/15"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#4D1627] py-3 text-sm font-semibold text-[#FAF6EE] shadow-md transition hover:bg-[#3A0F1D] active:scale-[0.985] disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Enter Workspace →"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center font-serif text-sm text-[#E8D7BC]">
          Check it before you publish it.
        </p>
      </div>
    </div>
  );
}