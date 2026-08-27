import { describe, expect, it } from "vitest";
import { answerQuestion, makeChatMessage } from "./chat";
import { bannedIn, buildCorpus } from "./chat-corpus";
import { isFollowUp, resolveQuestion } from "./chat-history";
import type { ChatMessage, Profile } from "./types";

const profile: Profile = {
  firstName: "James",
  lastName: "",
  name: "James",
  age: 19,
  sex: "male",
  heightCm: 180,
  weightKg: 75,
  activity: "light",
  medications: ["Adderall"],
  supplements: [],
  struggles: ["falling", "staying"],
  targetSleep: "23:30",
  targetWake: "07:30",
  units: "imperial",
  notificationsEnabled: false,
  onboardingComplete: true,
  email: "",
  phone: "",
};

const corpus = buildCorpus();

function historyFromPrior(prior: string[]): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (const p of prior) {
    const reply = answerQuestion(p, profile, [], msgs);
    msgs.push(makeChatMessage("you", p), makeChatMessage("circadia", reply.text, reply.citations));
  }
  return msgs;
}

describe("consult corpus", () => {
  it("covers thousands of utterances including follow-ups", () => {
    expect(corpus.length).toBeGreaterThan(2500);
    expect(corpus.some((c) => c.prior && c.prior.length > 0)).toBe(true);
  });

  it("answers the corpus without jargon, empty-diary dumps, or stop-the-drug orders", () => {
    const failures: string[] = [];
    for (const row of corpus) {
      const history = row.prior ? historyFromPrior(row.prior) : [];
      const reply = answerQuestion(row.q, profile, [], history);
      const text = reply.text.toLowerCase();
      if (bannedIn(reply.text)) {
        failures.push(`${row.id} [${row.q}] banned language: ${reply.text.slice(0, 160)}`);
        continue;
      }
      if (row.withhold) {
        if (reply.citations.length > 0 || !/solid note/.test(text)) {
          failures.push(`${row.id} [${row.q}] expected withhold, got ${reply.citations.join(",")} ${reply.text.slice(0, 120)}`);
        }
        continue;
      }
      if (row.citationsInclude) {
        const ok = row.citationsInclude.some((id) => reply.citations.includes(id));
        if (!ok) {
          failures.push(
            `${row.id} [${row.q}] wanted ${row.citationsInclude.join("|")} got ${reply.citations.join(",") || "(none)"}`,
          );
          continue;
        }
      }
      if (!new RegExp(row.must, "i").test(reply.text)) {
        failures.push(`${row.id} [${row.q}] missing /${row.must}/ in: ${reply.text.slice(0, 180)}`);
      }
    }
    expect(failures.slice(0, 25), `${failures.length} failures\n${failures.slice(0, 25).join("\n")}`).toEqual([]);
  });

  it("keeps Unisom gels as a follow-up, not a diary recap", () => {
    const history = historyFromPrior(["tell me about unisom"]);
    const reply = answerQuestion("what about the gels?", profile, [], history);
    expect(reply.citations).toContain("otc-antihistamines");
    expect(reply.text.toLowerCase()).toMatch(/diphenhydramine/);
    expect(reply.text.toLowerCase()).not.toMatch(/empty diary/);
  });

  it("treats how much? after melatonin as a dose follow-up", () => {
    expect(isFollowUp("how much?")).toBe(true);
    const history = historyFromPrior(["should I take melatonin"]);
    expect(resolveQuestion("how much?", history).toLowerCase()).toMatch(/melatonin/);
    const reply = answerQuestion("how much?", profile, [], history);
    expect(reply.citations).toContain("melatonin");
    expect(reply.text).toMatch(/0\.3–1 mg|0\.3-1 mg/);
  });
});
