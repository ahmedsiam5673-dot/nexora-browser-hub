import { NextResponse } from "next/server";
import { pingDb } from "@/db";
import { googleConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Non-sensitive operational status. No user data. */
export async function GET() {
  const db = process.env.DATABASE_URL ? await pingDb() : false;
  const body = { status: db ? "ok" : "degraded", database: db ? "up" : "down", googleSignIn: googleConfigured() ? "configured" : "not configured" };
  return NextResponse.json(body, { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
