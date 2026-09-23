import { NextResponse } from "next/server";
import { moderatorKeyOk } from "@/lib/mod-key";
import { deleteTesterNights } from "@/lib/operator-store";
import { isOperatorSurface } from "@/lib/surface";
import { studyInboxDir } from "@/lib/study-inbox";

export const runtime = "nodejs";

function providedKey(request: Request): string {
  return request.headers.get("x-circadia-mod")?.trim() ?? "";
}

export async function POST(request: Request) {
  if (!isOperatorSurface()) {
    return new NextResponse("Not found.", { status: 404 });
  }
  if (!moderatorKeyOk(providedKey(request))) {
    return NextResponse.json({ ok: false, error: "No." }, { status: 401 });
  }
  let participantId = "";
  let confirmation = "";
  try {
    const raw = (await request.json()) as { participantId?: unknown; confirmation?: unknown };
    participantId = typeof raw.participantId === "string" ? raw.participantId : "";
    confirmation = typeof raw.confirmation === "string" ? raw.confirmation : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const result = deleteTesterNights(participantId, confirmation, studyInboxDir());
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Type the confirmation to delete this tester's nights." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, removed: result.removed });
}
