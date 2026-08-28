import { describe, expect, it } from "vitest";
import { RESEARCH, matchResearch, researchById } from "./research";

describe("research match", () => {
  it("maps Unisom to the aisle-antihistamine note", () => {
    const hit = matchResearch("tell me about unisom");
    expect(hit?.id).toBe("otc-antihistamines");
  });

  it("maps Ambien and the newer wake-signal blockers to prescription hypnotics", () => {
    expect(matchResearch("is Ambien safe")?.id).toBe("prescription-hypnotics");
    expect(matchResearch("what is Quviviq")?.id).toBe("prescription-hypnotics");
    expect(matchResearch("Dayvigo at night")?.id).toBe("prescription-hypnotics");
    expect(matchResearch("Belsomra")?.id).toBe("prescription-hypnotics");
    expect(researchById("prescription-hypnotics")?.aliases).toEqual(
      expect.arrayContaining(["ambien", "quviviq", "dayvigo", "belsomra"]),
    );
  });

  it("keeps the mouth (say) free of engine jargon", () => {
    const ban = /aasm|cbt-i|\bscn\b/i;
    for (const article of RESEARCH) {
      if (article.say) expect(article.say, article.id).not.toMatch(ban);
    }
    expect(researchById("prescription-hypnotics")?.say).toMatch(/Belsomra|Dayvigo|Quviviq/);
    expect(researchById("alcohol")?.say).toMatch(/one or two drinks|dream sleep/);
  });
});
