import { describe, expect, it } from "vitest";
import { ERASE_CONFIRM_WORD, typedWordMatches } from "./confirm-word";

describe("typedWordMatches", () => {
  it("accepts the erase word ignoring case and surrounding space", () => {
    expect(typedWordMatches("erase", ERASE_CONFIRM_WORD)).toBe(true);
    expect(typedWordMatches(" ERASE ", ERASE_CONFIRM_WORD)).toBe(true);
    expect(typedWordMatches("Erase", ERASE_CONFIRM_WORD)).toBe(true);
  });

  it("rejects a missing, partial, or different word", () => {
    expect(typedWordMatches("", ERASE_CONFIRM_WORD)).toBe(false);
    expect(typedWordMatches("eras", ERASE_CONFIRM_WORD)).toBe(false);
    expect(typedWordMatches("delete", ERASE_CONFIRM_WORD)).toBe(false);
  });
});
