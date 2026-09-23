import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordStudyConsent } from "./consent";
import { createEpisode } from "./episode";
import {
  deriveInviteParticipantIdV2,
  enrollWithInvite,
  generateInvite,
  normalizeInviteCodeV2,
} from "./invite";
import { fingerprintPublicKey } from "./operator-fingerprint";
import { operatorPublicFingerprint, setOperatorPublicB64ForTests } from "./operator-public";
import { bytesToBase64, encryptPayload } from "./password";
import { derivePackLocation } from "./pack-derive";
import {
  applyDelivery,
  deliverPhonePack,
  fingerprintPack,
  packAssociatedId,
  studyDeliveryLine,
  studyJoinNotice,
} from "./pack-deliver";
import { generateOperatorKeyPair, openEnvelope } from "./pack-seal";
import type { PackHttp, PackHttpRequest, PackHttpResponse } from "./pack-http";
import { DEFAULT_SCHEDULED_DAYS } from "./schedule";
import { emptyState, persistableState } from "./storage";
import { buildStudyPack } from "./study";
import type { CircadiaState, Profile } from "./types";

const profile: Profile = {
  firstName: "A",
  lastName: "",
  name: "A",
  age: 34,
  sex: "female",
  heightCm: 170,
  weightKg: 68,
  activity: "light",
  medications: [],
  supplements: [],
  struggles: ["falling"],
  targetSleep: "23:00",
  targetWake: "07:00",
  units: "metric",
  notificationsEnabled: false,
  onboardingComplete: true,
  email: "",
  phone: "",
  scheduledDays: DEFAULT_SCHEDULED_DAYS,
};

function withProfile(extra?: Partial<CircadiaState>): CircadiaState {
  return { ...emptyState(), profile, ...extra };
}

function consented(state: CircadiaState): CircadiaState {
  return { ...state, study: recordStudyConsent(state.study, new Date("2026-09-22T12:00:00.000Z")) };
}

function http(handler: (req: PackHttpRequest, n: number) => PackHttpResponse): {
  calls: PackHttpRequest[];
  impl: PackHttp;
} {
  const calls: PackHttpRequest[] = [];
  return {
    calls,
    impl: {
      async request(opts) {
        calls.push(opts);
        return handler(opts, calls.length);
      },
    },
  };
}

describe("pack deliver", () => {
  it("the phone derives the same participant id, Worker id and bearer as Operator, from any casing and dashes", async () => {
    const invite = await generateInvite("Ada West", "friend");
    const normalized = normalizeInviteCodeV2(invite.code)!;
    const id = await deriveInviteParticipantIdV2(normalized);
    const location = await derivePackLocation(normalized);
    for (const form of [invite.code, invite.code.toLowerCase(), normalized, `  ${invite.code}  `]) {
      const joined = await enrollWithInvite(withProfile(), form);
      expect(joined?.study.participantId).toBe(id);
      expect(joined?.study.inviteNormalized).toBe(normalized);
      expect(await derivePackLocation(joined!.study.inviteNormalized!)).toEqual(location);
    }
  });

  it("the invite never appears in a pack, a log, or unencrypted storage", async () => {
    const keys = await generateOperatorKeyPair();
    const invite = await generateInvite("Ada West", "friend");
    const joined = await enrollWithInvite(withProfile(), invite.code);
    expect(joined).toBeTruthy();
    const pack = buildStudyPack(joined!);
    const packJson = JSON.stringify(pack);
    expect(packJson).not.toContain(invite.code);
    expect(packJson).not.toContain(joined!.study.inviteNormalized);
    const persist = persistableState(joined!);
    expect(JSON.stringify(persist)).toContain(joined!.study.inviteNormalized);
    const sealed = await encryptPayload(persist, crypto.getRandomValues(new Uint8Array(32)), 1);
    expect(JSON.stringify(sealed)).not.toContain(joined!.study.inviteNormalized);
    expect(JSON.stringify(sealed)).not.toContain(invite.code);
    const wire: string[] = [];
    const mock = http((req) => {
      wire.push(`${req.url}\n${JSON.stringify(req.headers)}\n${req.data ?? ""}`);
      return { status: 201, headers: { etag: '"e1"' }, data: "" };
    });
    await deliverPhonePack({ state: consented(joined!), operatorPublicRaw: keys.publicRaw, http: mock.impl });
    const onWire = wire.join("\n");
    expect(onWire).not.toContain(invite.code);
    expect(onWire).not.toContain(joined!.study.inviteNormalized);
    const opened = await openEnvelope(JSON.parse(mock.calls[0]!.data ?? "{}"), keys.privateKey, joined!.study.participantId!);
    expect(opened.ok).toBe(true);
    if (opened.ok && opened.kind === "pack") {
      expect(JSON.stringify(opened.value)).not.toContain(invite.code);
      expect(JSON.stringify(opened.value)).not.toContain(joined!.study.inviteNormalized);
    }
    const enroll = readFileSync("src/lib/invite.ts", "utf8");
    const deliver = readFileSync("src/lib/pack-deliver.ts", "utf8");
    const send = readFileSync("src/lib/pack-send.ts", "utf8");
    const store = readFileSync("src/context/circadia-store.tsx", "utf8");
    for (const src of [enroll, deliver, send, store]) {
      expect(src).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*invite/i);
      expect(src).not.toMatch(/localStorage\.setItem\([^)]*invite/i);
    }
  });

  it("a pack that fails the anonymity scan is never sealed or sent", async () => {
    const keys = await generateOperatorKeyPair();
    const invite = await generateInvite("Ada West", "friend");
    const joined = await enrollWithInvite(
      withProfile({
        profile: { ...profile, name: "female", firstName: "female" },
      }),
      invite.code,
    );
    const mock = http(() => {
      throw new Error("Worker must not be called");
    });
    const result = await deliverPhonePack({
      state: consented(joined!),
      operatorPublicRaw: keys.publicRaw,
      http: mock.impl,
    });
    expect(result).toEqual({ status: "blocked" });
    expect(mock.calls).toHaveLength(0);
  });

  it("filing a morning succeeds when the send fails", () => {
    const store = readFileSync("src/context/circadia-store.tsx", "utf8");
    const addFn = store.slice(store.indexOf("const addReport"), store.indexOf("const saveMorningDraft"));
    expect(addFn).toMatch(/void transmitStudy/);
    expect(addFn).not.toMatch(/await transmitStudy/);
    expect(addFn).toMatch(/shouldSend/);
  });

  it("the indicator never shows Last sent after a failed send", () => {
    const failed = applyDelivery(emptyState().study, { status: "failed", error: "offline" });
    expect(failed.lastSentAt).toBeNull();
    expect(studyDeliveryLine(failed, new Date("2026-09-22T13:42:00"))).toBe(
      "Not sent yet; will retry when you're online.",
    );
    expect(studyDeliveryLine(failed)).not.toMatch(/Last sent/);
    const sent = applyDelivery(emptyState().study, {
      status: "sent",
      etag: '"e1"',
      at: "2026-09-22T13:42:00.000Z",
      packHash: "abc",
    });
    const afterFail = applyDelivery(sent, { status: "failed", error: "offline" });
    expect(afterFail.lastSentAt).toBe(sent.lastSentAt);
    expect(studyDeliveryLine(afterFail, new Date("2026-09-22T13:42:00.000Z"))).toMatch(/^Last sent: today,/);
  });

  it("leaving sends a sealed withdrawal and no further packs", async () => {
    const keys = await generateOperatorKeyPair();
    const invite = await generateInvite("Ada West", "friend");
    const joined = await enrollWithInvite(withProfile(), invite.code);
    const left: CircadiaState = {
      ...joined!,
      study: {
        ...joined!.study,
        consented: false,
        withdrawnAt: "2026-09-22T12:00:00.000Z",
        sendPending: true,
      },
    };
    const bodies: unknown[] = [];
    const mock = http((req) => {
      bodies.push(JSON.parse(req.data ?? "{}"));
      return { status: 201, headers: { etag: '"w1"' }, data: "" };
    });
    const result = await deliverPhonePack({
      state: left,
      operatorPublicRaw: keys.publicRaw,
      http: mock.impl,
    });
    expect(result.status).toBe("sent");
    const opened = await openEnvelope(bodies[0], keys.privateKey, left.study.participantId!);
    expect(opened).toEqual({ ok: true, kind: "withdrawal" });
    const again = await deliverPhonePack({
      state: {
        ...left,
        study: { ...left.study, withdrawnAt: "2026-09-22T12:00:00.000Z", consented: false, packEtag: '"w1"' },
      },
      operatorPublicRaw: keys.publicRaw,
      http: http((req) => {
        bodies.push(JSON.parse(req.data ?? "{}"));
        return { status: 200, headers: { etag: '"w2"' }, data: "" };
      }).impl,
    });
    expect(again.status).toBe("sent");
    const second = await openEnvelope(bodies[1], keys.privateKey, left.study.participantId!);
    expect(second).toEqual({ ok: true, kind: "withdrawal" });
  });

  it("a v1 device sends nothing", async () => {
    const keys = await generateOperatorKeyPair();
    const joined = await enrollWithInvite(withProfile(), "A10B-C3D4");
    expect(joined?.study.inviteVersion).toBe(1);
    expect(studyJoinNotice(joined!)).toBe("This invite can't send your nights. Ask for a new one.");
    const mock = http(() => {
      throw new Error("v1 must not hit the Worker");
    });
    const result = await deliverPhonePack({
      state: consented(joined!),
      operatorPublicRaw: keys.publicRaw,
      http: mock.impl,
    });
    expect(result).toEqual({ status: "skipped" });
    expect(mock.calls).toHaveLength(0);
  });

  it("leaving while offline stores a pending withdrawal and sends it on the next open", async () => {
    const store = readFileSync("src/context/circadia-store.tsx", "utf8");
    expect(store).toContain("withdrawnAt: new Date().toISOString(),\n        sendPending: prev.study.inviteVersion === 2,");
    expect(store).toContain("if (!ready || !isPhoneNative()) return;\n    void flushPhoneDelivery();");
    expect(store).not.toContain("if (!state.study.sendPending) return;");
    const keys = await generateOperatorKeyPair();
    const invite = await generateInvite("Ada West", "friend");
    const joined = await enrollWithInvite(withProfile(), invite.code);
    const left: CircadiaState = {
      ...joined!,
      study: {
        ...joined!.study,
        consented: false,
        withdrawnAt: "2026-09-22T12:00:00.000Z",
        sendPending: true,
      },
    };
    const failed = await deliverPhonePack({
      state: left,
      operatorPublicRaw: keys.publicRaw,
      http: http(() => ({ status: 500, headers: {}, data: "" })).impl,
    });
    expect(failed.status).toBe("failed");
    const pending = applyDelivery(left.study, failed);
    expect(pending.withdrawnAt).toBe("2026-09-22T12:00:00.000Z");
    expect(pending.sendPending).toBe(true);
    const bodies: unknown[] = [];
    const retryHttp = http((req) => {
      bodies.push(JSON.parse(req.data ?? "{}"));
      return { status: 201, headers: { etag: '"w1"' }, data: "" };
    });
    const retry = await deliverPhonePack({
      state: { ...left, study: pending },
      operatorPublicRaw: keys.publicRaw,
      http: retryHttp.impl,
    });
    expect(retry.status).toBe("sent");
    expect(retryHttp.calls).toHaveLength(1);
    const opened = await openEnvelope(bodies[0], keys.privateKey, left.study.participantId!);
    expect(opened).toEqual({ ok: true, kind: "withdrawal" });
  });

  it("after a v2 join, the pack's participant id equals the id in its associated data", async () => {
    const keys = await generateOperatorKeyPair();
    const invite = await generateInvite("Ada West", "friend");
    const episode = createEpisode({ clinicianId: null, enrolledAt: "2026-09-10T12:00:00.000Z" });
    const legacy = withProfile({
      episode,
      study: {
        ...emptyState().study,
        asked: true,
        consented: true,
        participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      },
    });
    const joined = await enrollWithInvite(legacy, invite.code, new Date("2026-09-16T12:00:00.000Z"));
    expect(joined?.study.participantId).toBe(invite.participantId);
    expect(joined?.episode?.id).toBe(episode.id);
    expect(studyJoinNotice(joined!, new Date("2026-09-16T12:00:00.000Z"))).toBe(
      "You're in. Night 7 of 14 starts tonight.",
    );
    const pack = buildStudyPack(joined!);
    expect(pack.participantId).toBe(invite.participantId);
    expect(packAssociatedId(pack.participantId)).toBe(pack.participantId);
    const mock = http((req) => {
      expect(JSON.parse(req.data ?? "{}")).not.toHaveProperty("participantId");
      return { status: 201, headers: { etag: '"e1"' }, data: "" };
    });
    const result = await deliverPhonePack({
      state: consented(joined!),
      operatorPublicRaw: keys.publicRaw,
      http: mock.impl,
    });
    expect(result.status).toBe("sent");
  });

  it("joining sends once, without waiting for a morning", async () => {
    const keys = await generateOperatorKeyPair();
    const invite = await generateInvite("Ada West", "friend");
    const joined = consented((await enrollWithInvite(withProfile(), invite.code))!);
    expect(joined?.reports).toHaveLength(0);
    const mock = http(() => ({ status: 201, headers: { etag: '"e1"' }, data: "" }));
    const result = await deliverPhonePack({
      state: joined!,
      operatorPublicRaw: keys.publicRaw,
      http: mock.impl,
    });
    expect(result.status).toBe("sent");
    expect(mock.calls).toHaveLength(1);
    expect(studyJoinNotice(joined!, new Date(joined!.episode!.enrolledAt))).toBe(
      "You're in. Night 1 of 14 starts tonight.",
    );
  });

  it("opening the app with a changed pack sends it; with an unchanged pack, sends nothing", async () => {
    const keys = await generateOperatorKeyPair();
    const invite = await generateInvite("Ada West", "friend");
    const joined = consented((await enrollWithInvite(withProfile(), invite.code))!);
    const firstHttp = http(() => ({ status: 201, headers: { etag: '"e1"' }, data: "" }));
    const first = await deliverPhonePack({
      state: joined!,
      operatorPublicRaw: keys.publicRaw,
      http: firstHttp.impl,
    });
    expect(first.status).toBe("sent");
    expect(firstHttp.calls).toHaveLength(1);
    if (first.status !== "sent") return;
    const after = { ...joined!, study: applyDelivery(joined!.study, first) };
    const againHttp = http(() => {
      throw new Error("identical pack must not be resent");
    });
    const again = await deliverPhonePack({
      state: after,
      operatorPublicRaw: keys.publicRaw,
      http: againHttp.impl,
    });
    expect(again.status).toBe("skipped");
    expect(againHttp.calls).toHaveLength(0);
    const stale = {
      ...after,
      study: { ...after.study, lastSentPackHash: "not-the-current-pack" },
    };
    const changedHttp = http(() => ({ status: 200, headers: { etag: '"e2"' }, data: "" }));
    const changed = await deliverPhonePack({
      state: stale,
      operatorPublicRaw: keys.publicRaw,
      http: changedHttp.impl,
    });
    expect(changed.status).toBe("sent");
    expect(changedHttp.calls).toHaveLength(1);
    const store = readFileSync("src/context/circadia-store.tsx", "utf8");
    expect(store).toContain("if (!ready || !isPhoneNative()) return;\n    void flushPhoneDelivery();");
    expect(store).not.toContain("if (!state.study.sendPending) return;");
  });

  it("after a failed send, the next open sends again", async () => {
    const keys = await generateOperatorKeyPair();
    const invite = await generateInvite("Ada West", "friend");
    const joined = consented((await enrollWithInvite(withProfile(), invite.code))!);
    const failHttp = http(() => ({ status: 500, headers: {}, data: "" }));
    const failed = await deliverPhonePack({
      state: joined!,
      operatorPublicRaw: keys.publicRaw,
      http: failHttp.impl,
    });
    expect(failed.status).toBe("failed");
    const afterFail = applyDelivery(joined!.study, failed);
    expect(afterFail.lastSentAt).toBeNull();
    expect(afterFail.lastSentPackHash ?? null).toBeNull();
    expect(afterFail.sendPending).toBe(true);
    const retryHttp = http(() => ({ status: 201, headers: { etag: '"e1"' }, data: "" }));
    const retry = await deliverPhonePack({
      state: { ...joined!, study: afterFail },
      operatorPublicRaw: keys.publicRaw,
      http: retryHttp.impl,
    });
    expect(retry.status).toBe("sent");
    expect(retryHttp.calls).toHaveLength(1);
    if (retry.status === "sent") {
      expect(retry.packHash).toBe(await fingerprintPack(buildStudyPack({ ...joined!, study: afterFail })));
    }
  });

  it("the phone fingerprint is computed exactly as Operator does", async () => {
    const keys = await generateOperatorKeyPair();
    const b64 = bytesToBase64(keys.publicRaw);
    setOperatorPublicB64ForTests(b64);
    expect(await operatorPublicFingerprint()).toBe(await fingerprintPublicKey(keys.publicRaw));
    setOperatorPublicB64ForTests(undefined);
  });
});
