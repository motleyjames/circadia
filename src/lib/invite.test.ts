import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEpisode } from "./episode";
import { enrollWithInvite, generateInvite, joinInvite, parseInviteCode } from "./invite";
import { emptyState } from "./storage";
import type { CircadiaState } from "./types";

function blank(): CircadiaState {
  return emptyState();
}

describe("invite codes", () => {
  it("a tester who reinstalls keeps their join to James's record", () => {
    const invite = generateInvite("Ada West", "friend");
    expect(parseInviteCode(invite.participantId)).toBe(invite.participantId.toLowerCase());
    const first = enrollWithInvite(blank(), invite.participantId, new Date("2026-09-01T12:00:00Z"));
    expect(first?.study.participantId).toBe(invite.participantId.toLowerCase());
    expect(first?.episode?.clinicianId).toBeNull();
    expect(first?.episode?.state).toBe("enrolled");
    expect(joinInvite([invite], first!.study.participantId!)).toEqual(invite);

    const reinstalled = enrollWithInvite(blank(), invite.participantId, new Date("2026-09-10T08:00:00Z"));
    expect(reinstalled?.study.participantId).toBe(first?.study.participantId);
    expect(joinInvite([invite], reinstalled!.study.participantId!)).toEqual(invite);
  });

  it("refuses a clinical episode and a non-UUID code", () => {
    const invite = generateInvite("Ada West", "stranger");
    const clinical: CircadiaState = {
      ...blank(),
      episode: createEpisode({ clinicianId: "clin-1" }),
    };
    expect(enrollWithInvite(clinical, invite.participantId)).toBeNull();
    expect(enrollWithInvite(blank(), "not-a-code")).toBeNull();
    expect(parseInviteCode("")).toBeNull();
  });

  it("no shakedown join produces a participantId Operator did not issue", () => {
    const book = [generateInvite("Ada West", "friend")];
    const joined = enrollWithInvite(blank(), book[0]!.participantId);
    expect(joined).toBeTruthy();
    expect(joinInvite(book, joined!.study.participantId!)).toEqual(book[0]);
    expect(joined!.episode?.clinicianId).toBeNull();

    const inviteSrc = readFileSync("src/lib/invite.ts", "utf8");
    const enrollFn = inviteSrc.slice(inviteSrc.indexOf("export function enrollWithInvite"));
    expect(enrollFn).toMatch(/parseInviteCode\(code\)/);
    expect(enrollFn).not.toMatch(/newId\(/);

    const store = readFileSync("src/context/circadia-store.tsx", "utf8");
    const joinFn = store.slice(store.indexOf("const joinStudy ="), store.indexOf("const enrollSolo ="));
    expect(joinFn).not.toMatch(/newId\(/);
    expect(joinFn).not.toMatch(/createEpisode/);
    expect(joinFn).toMatch(/if \(!snapshot\(\)\.study\.participantId\) return;/);

    const panel = readFileSync("src/components/study-panel.tsx", "utf8");
    const gate = readFileSync("src/components/study-gate.tsx", "utf8");
    expect(panel).not.toMatch(/joinStudy\(/);
    expect(gate).not.toMatch(/joinStudy\(/);
    expect(panel).toMatch(/enrollSolo/);
    expect(gate).toMatch(/enrollSolo/);
  });
});
