// Next.js App Router API Route: app/api/health-score/route.ts
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.TRUEVOICE_BACKEND_URL || "http://localhost:8000";

export async function GET() {
  const res = await fetch(`${BACKEND_URL}/api/health-score`, {
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
