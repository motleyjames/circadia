import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrisisLine } from "@/components/crisis-line";

describe("native scheme handoff", () => {
  it("the shell opens sms, mailto and tel in the system app and refuses any other non-http scheme", () => {
    const shell = readFileSync("electron/launcher.swift", "utf8");
    expect(shell).toContain('let nativeSchemes = ["sms", "mailto", "tel"]');
    const policy = shell.slice(shell.indexOf("decidePolicyFor"));
    expect(policy).toContain("NSWorkspace.shared.open(url)");
    expect(policy).toContain("nativeSchemes.contains(scheme)");
    expect(policy).toMatch(/scheme == "http"/);
    expect(policy).toMatch(/scheme == "https"/);
    expect(policy).toContain("decisionHandler(.cancel)");
    expect(policy.indexOf("NSWorkspace.shared.open(url)")).toBeLessThan(policy.lastIndexOf("decisionHandler(.cancel)"));
    expect(existsSync("src/app/mod/testers/page.tsx")).toBe(true);
    const chrome = readFileSync("src/components/operator-chrome.tsx", "utf8");
    expect(chrome).toContain('href: "/mod/testers"');
    expect(chrome).toContain('href: "/mod/invite"');
    expect(chrome).toContain('href: "/mod/exports"');
  });

  it("the patient app still renders 988 as a tel: link, and tel: is in the shell's allowlist", () => {
    const html = renderToString(createElement(CrisisLine));
    expect(html).toContain('href="tel:988"');
    const shell = readFileSync("electron/launcher.swift", "utf8");
    expect(shell).toContain('let nativeSchemes = ["sms", "mailto", "tel"]');
  });
});
