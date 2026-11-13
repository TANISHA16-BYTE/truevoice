// Next.js App Router API Route: app/api/drafts/route.ts
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.TRUEVOICE_BACKEND_URL || "http://localhost:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const res = await fetch(`${BACKEND_URL}/api/drafts?${searchParams.toString()}`, {
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/api/drafts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
