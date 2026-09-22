import { BASELINE_NIGHTS, nightsElapsedSince } from "@/lib/episode";
import { derivePackLocation } from "@/lib/pack-derive";
import { putSealedPack } from "@/lib/pack-send";
import { packAssociatedData, sealPayload } from "@/lib/pack-seal";
import type { PackHttp } from "@/lib/pack-http";
import { assertSendable, buildStudyPack } from "@/lib/study";
import { todayIsoDate } from "@/lib/time";
import type { CircadiaState, StudyState } from "@/lib/types";

export type DeliveryResult =
  | { status: "sent"; etag: string; at: string }
  | { status: "blocked" }
  | { status: "skipped" }
  | { status: "failed"; error: string };

export function studyJoinNotice(state: CircadiaState, now = new Date()): string {
  if (state.study.inviteVersion === 1) {
    return "This invite can't send your nights. Ask for a new one.";
  }
  const baseline = state.episode?.baselineNights ?? BASELINE_NIGHTS;
  const night = (state.episode ? nightsElapsedSince(state.episode.enrolledAt, now) : 0) + 1;
  return `You're in. Night ${night} of ${baseline} starts tonight.`;
}

export function studyDeliveryLine(study: Pick<StudyState, "lastSentAt">, now = new Date()): string {
  if (!study.lastSentAt) return "Not sent yet; will retry when you're online.";
  const at = new Date(study.lastSentAt);
  if (!Number.isFinite(at.getTime())) return "Not sent yet; will retry when you're online.";
  const day = todayIsoDate(at) === todayIsoDate(now) ? "today" : at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const hour = at.getHours() % 12 || 12;
  const minute = String(at.getMinutes()).padStart(2, "0");
  return `Last sent: ${day}, ${hour}:${minute}`;
}

export function applyDelivery(study: StudyState, result: DeliveryResult): StudyState {
  if (result.status === "sent") {
    return {
      ...study,
      lastSentAt: result.at,
      lastStatus: "sent",
      lastError: null,
      packEtag: result.etag,
      sendPending: false,
    };
  }
  if (result.status === "blocked") {
    return {
      ...study,
      lastStatus: "blocked",
      lastError: "Pack failed the anonymity check. Nothing left this device.",
      sendPending: false,
    };
  }
  if (result.status === "failed") {
    return {
      ...study,
      lastStatus: "error",
      lastError: result.error,
      sendPending: true,
    };
  }
  return study;
}

export async function deliverPhonePack(input: {
  state: CircadiaState;
  operatorPublicRaw: Uint8Array;
  http: PackHttp;
  now?: Date;
}): Promise<DeliveryResult> {
  const study = input.state.study;
  if (study.inviteVersion !== 2) return { status: "skipped" };
  const invite = study.inviteNormalized;
  if (!invite) return { status: "skipped" };
  const participantId = study.participantId;
  if (!participantId) return { status: "skipped" };

  const withdrawn = Boolean(study.withdrawnAt);
  if (!withdrawn && !study.consented) return { status: "skipped" };
  if (!withdrawn && !input.state.profile) {
    return { status: "failed", error: "No profile." };
  }

  let payload: unknown;
  if (withdrawn) {
    payload = { withdrawn: true };
  } else {
    const pack = buildStudyPack(input.state, input.now);
    if (assertSendable(pack, input.state).length) return { status: "blocked" };
    payload = pack;
  }

  try {
    const envelope = await sealPayload(payload, input.operatorPublicRaw, participantId);
    const location = await derivePackLocation(invite);
    const put = await putSealedPack({
      envelope,
      workerId: location.workerId,
      bearer: location.bearer,
      etag: study.packEtag ?? null,
      http: input.http,
    });
    if (!put.ok) return { status: "failed", error: put.error };
    return { status: "sent", etag: put.etag, at: (input.now ?? new Date()).toISOString() };
  } catch {
    return { status: "failed", error: "Could not seal this pack." };
  }
}

export function packAssociatedId(participantId: string): string {
  return new TextDecoder().decode(packAssociatedData(participantId)).slice("circadia/pack/v2".length);
}
