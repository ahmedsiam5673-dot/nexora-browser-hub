import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { exportUserData } from "@/db/repo";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const data = await exportUserData(getDb(), user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nexora-export.json"',
      "Cache-Control": "no-store",
    },
  });
}
