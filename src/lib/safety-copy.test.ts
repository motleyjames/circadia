import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrisisLine } from "@/components/crisis-line";
import {
  CRISIS_LINE,
  CRISIS_LIFELINE_NUMBER,
  MEDICAL_DISCLAIMER,
} from "@/lib/safety-copy";

const ENGINE_JARGON = /\b(AASM|CBT-I|SCN|MSFsc|MSF|MSW|chronotype|melanopsin)\b/i;

const safetySrc = readFileSync("src/lib/safety-copy.ts", "utf8");
const crisisSrc = readFileSync("src/components/crisis-line.tsx", "utf8");
const youSrc = readFileSync("src/components/you-view.tsx", "utf8");
const consultSrc = readFileSync("src/components/chat-bar.tsx", "utf8");
const onboardSrc = readFileSync("src/components/onboarding.tsx", "utf8");

describe("safety copy — shared strings", () => {
  it("keeps the medical disclaimer Circadia already ships on You", () => {
    expect(MEDICAL_DISCLAIMER).toBe(
      "Educational tool. Not medical care. If you stop breathing at night, fall asleep while driving, or cannot stay awake, that is a clinic, not a chat bar.",
    );
    expect(MEDICAL_DISCLAIMER).not.toMatch(ENGINE_JARGON);
  });

  it("names 988 as the US Suicide & Crisis Lifeline", () => {
    expect(CRISIS_LIFELINE_NUMBER).toBe("988");
    expect(CRISIS_LINE).toContain("988");
    expect(CRISIS_LINE).toContain("US");
    expect(CRISIS_LINE).toMatch(/Suicide & Crisis Lifeline/);
    expect(CRISIS_LINE).toMatch(/emergency services/);
    expect(CRISIS_LINE).not.toMatch(ENGINE_JARGON);
  });

  it("comments that 988 is US-scoped because Circadia does not detect country", () => {
    expect(safetySrc).toMatch(/US-scoped/);
    expect(safetySrc).toMatch(/does not detect country/);
    expect(safetySrc).toMatch(/US Suicide & Crisis Lifeline/);
  });
});

describe("safety copy — surfaces", () => {
  it("You and Consult render the shared 988 line; onboarding uses the medical disclaimer", () => {
    expect(youSrc).toContain("MEDICAL_DISCLAIMER");
    expect(youSrc).toContain("CrisisLine");
    expect(consultSrc).toContain("CrisisLine");
    expect(consultSrc).toContain("{crisis}");
    expect(onboardSrc).toContain("MEDICAL_DISCLAIMER");
  });

  it("does not shout the crisis line as a red banner", () => {
    // Quiet, not invisible. It was `zinc-600` at 10px — about 2.6:1 on the night
    // sky, roughly half the readable floor, for the one line someone might need
    // at their worst. Still no red, still no alert role, still always on.
    expect(crisisSrc).toContain("zinc-400");
    expect(crisisSrc).not.toContain("zinc-600");
    expect(crisisSrc).not.toContain("text-[10px]");
    expect(crisisSrc).not.toMatch(/bg-red|text-red|role="alert"/);
    expect(consultSrc).not.toMatch(/suicid|crisis keyword|crisisGate/i);
    expect(youSrc).not.toMatch(/suicid|crisis keyword/i);
  });

  it("pins the Consult line outside the composer so history and a collapsed dock still show it", () => {
    expect(consultSrc).toMatch(/const crisis = <CrisisLine/);
    const composerBlock = consultSrc.slice(
      consultSrc.indexOf("const composer"),
      consultSrc.indexOf("const crisis"),
    );
    expect(composerBlock).not.toContain("CrisisLine");
    expect(consultSrc).toContain("{crisis}");
    expect(consultSrc.split("{crisis}").length - 1).toBe(2);
  });

  it("puts the medical disclaimer on the last onboarding step, which every finish path sees", () => {
    const lastStep = onboardSrc.slice(onboardSrc.indexOf("step === 5"));
    const beforeFooter = lastStep.slice(0, lastStep.indexOf("<footer"));
    expect(beforeFooter).toContain("{MEDICAL_DISCLAIMER}");
    expect(onboardSrc.split("{MEDICAL_DISCLAIMER}").length - 1).toBe(1);
  });

  it("CrisisLine renders the shared 988 sentence, readable and dialable", () => {
    const html = renderToString(createElement(CrisisLine));
    expect(html).toContain("988");
    expect(html).toContain("Suicide &amp; Crisis Lifeline");
    expect(html).toContain("zinc-400");
    // iOS will not auto-link it: layout.tsx sets formatDetection.telephone false.
    expect(html).toContain('href="tel:988"');
    expect(html).not.toMatch(/bg-red|text-red|role="alert"/);
    expect(html).not.toMatch(ENGINE_JARGON);
  });
});
