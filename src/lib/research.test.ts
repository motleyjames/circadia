import { describe, expect, it } from "vitest";
import { matchResearch, researchById } from "./research";

describe("research match", () => {
  it("maps Unisom to the aisle-antihistamine note", () => {
    const hit = matchResearch("tell me about unisom");
    expect(hit?.id).toBe("otc-antihistamines");
  });

  it("maps Ambien to prescription hypnotics", () => {
    expect(matchResearch("is Ambien safe")?.id).toBe("prescription-hypnotics");
    expect(researchById("prescription-hypnotics")?.aliases).toContain("ambien");
  });
});
