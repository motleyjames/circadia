import { describe, expect, it } from "vitest";
import {
  RESEARCH,
  formatReviewedThrough,
  matchResearch,
  parseReviewedThrough,
  researchAgeMonths,
  researchById,
  staleResearchIds,
  type ResearchArticle,
} from "./research";

const MOUTH_BAN = /aasm|cbt-i|\bscn\b/i;

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
    for (const article of RESEARCH) {
      if (article.say) expect(article.say, article.id).not.toMatch(MOUTH_BAN);
    }
    expect(researchById("prescription-hypnotics")?.say).toMatch(/Belsomra|Dayvigo|Quviviq/);
    expect(researchById("alcohol")?.say).toMatch(/one or two drinks|dream sleep/);
  });
});

describe("research freshness", () => {
  it("treats a 2019 stamp as stale against a 2026 clock", () => {
    const relic: ResearchArticle = {
      id: "relic",
      title: "Old",
      summary: "Old",
      body: "Old",
      tags: [],
      reviewedThrough: "2019-01",
      confidence: "high",
      sources: [{ year: 2019, cite: "expired" }],
    };
    expect(staleResearchIds([relic], new Date("2026-08-29T12:00:00Z"))).toEqual(["relic"]);
  });

  it("keeps a stamp from twelve months ago, and flags the thirteenth", () => {
    const now = new Date(2026, 7, 29); // August 2026, local
    const twelve: ResearchArticle = {
      id: "twelve",
      title: "t",
      summary: "t",
      body: "t",
      tags: [],
      reviewedThrough: "2025-08",
      confidence: "high",
      sources: [{ year: 2025, cite: "ok" }],
    };
    const thirteen: ResearchArticle = {
      ...twelve,
      id: "thirteen",
      reviewedThrough: "2025-07",
    };
    expect(researchAgeMonths("2025-08", now)).toBe(12);
    expect(researchAgeMonths("2025-07", now)).toBe(13);
    expect(staleResearchIds([twelve, thirteen], now)).toEqual(["thirteen"]);
  });

  it("treats a malformed stamp as stale", () => {
    const bad: ResearchArticle = {
      id: "bad-stamp",
      title: "t",
      summary: "t",
      body: "t",
      tags: [],
      reviewedThrough: "August 2026",
      confidence: "high",
      sources: [{ year: 2026, cite: "x" }],
    };
    expect(parseReviewedThrough("August 2026")).toBeNull();
    expect(staleResearchIds([bad], new Date(2026, 7, 1))).toEqual(["bad-stamp"]);
  });

  it("formats YYYY-MM as a short month year", () => {
    expect(formatReviewedThrough("2026-08")).toBe("Aug 2026");
    expect(formatReviewedThrough("not-a-date")).toBe("not-a-date");
  });

  it("has no stale notes on the live shelf (rolling 12 months from today)", () => {
    expect(staleResearchIds(RESEARCH), staleResearchIds(RESEARCH).join(", ")).toEqual([]);
  });

  it("stamps every live note with a review month and at least one dated source", () => {
    for (const article of RESEARCH) {
      expect(parseReviewedThrough(article.reviewedThrough), article.id).not.toBeNull();
      expect(article.sources.length, article.id).toBeGreaterThan(0);
      for (const source of article.sources) {
        expect(source.cite.trim().length, `${article.id} cite`).toBeGreaterThan(8);
        expect(source.year, `${article.id} year`).toBeGreaterThanOrEqual(2000);
        expect(source.year, `${article.id} year`).toBeLessThanOrEqual(new Date().getFullYear() + 1);
      }
    }
  });

  it("records the NSF 2026 duration reaffirmation", () => {
    const note = researchById("duration-age");
    expect(note?.body).toMatch(/National Sleep Foundation/i);
    expect(note?.body).toMatch(/2026/);
    expect(note?.body).toMatch(/133 meta-analyses/);
    expect(note?.sources.some((source) => source.year === 2026 && /NSF/i.test(source.cite))).toBe(true);
  });

  it("records the 2025 restless-legs guideline in the note, not the mouth", () => {
    const note = researchById("restless-legs");
    expect(note?.body).toMatch(/2025/);
    expect(note?.body).toMatch(/iron/i);
    expect(note?.say ?? "").not.toMatch(MOUTH_BAN);
    expect(note?.sources.some((source) => source.year === 2025)).toBe(true);
  });
});
