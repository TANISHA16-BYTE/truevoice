// Next.js App Router API Route: app/api/check/route.ts
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.TRUEVOICE_BACKEND_URL || "http://localhost:8000";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/api/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to run safety check" }, { status: 500 });
  }
}
