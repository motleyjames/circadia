import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightsView } from "@/components/insights-view";
import { LibraryView } from "@/components/library-view";
import { TonightView } from "@/components/tonight-view";
import { YouView } from "@/components/you-view";
import { CircadiaSafeTree, useCircadia } from "@/context/circadia-store";

function Probe() {
  const { ready, state } = useCircadia();
  return createElement("span", null, ready ? "ready" : "wait", ":", state.profile ? "profile" : "empty");
}

describe("useCircadia during prerender", () => {
  it("does not throw without a provider on the server", () => {
    const html = renderToString(createElement(Probe));
    expect(html).toContain("wait");
    expect(html).toContain("empty");
  });

  it("does not throw inside CircadiaSafeTree (operator compile)", () => {
    const html = renderToString(createElement(CircadiaSafeTree, null, createElement(Probe)));
    expect(html).toContain("wait");
  });

  it("does not throw for the diary views Operator used to prerender", () => {
    expect(() => renderToString(createElement(InsightsView))).not.toThrow();
    expect(() => renderToString(createElement(YouView))).not.toThrow();
    expect(() => renderToString(createElement(LibraryView))).not.toThrow();
    expect(() => renderToString(createElement(TonightView))).not.toThrow();
  });

  it("does not put a JSON dump on the Library shelf", () => {
    const html = renderToString(createElement(LibraryView));
    expect(html).not.toMatch(/Export JSON|Import JSON|Sleep data|Export everything/);
    expect(html).toMatch(/What we are willing to say/);
  });

  it("does not put a JSON dump on You either", () => {
    const html = renderToString(createElement(YouView));
    expect(html).not.toMatch(/Export JSON|Import JSON|Export everything/);
  });

  it("does not leave a JSON dump in any diary surface source", () => {
    const ban = /Export JSON|Import JSON|Export everything on this computer|nights leave on their own/;
    const files = [
      "src/components/library-view.tsx",
      "src/components/you-view.tsx",
      "src/components/insights-view.tsx",
      "src/components/tonight-view.tsx",
      "src/components/onboarding.tsx",
      "src/components/auth-gate.tsx",
      "src/components/study-gate.tsx",
      "src/components/study-panel.tsx",
      "src/components/chat-bar.tsx",
      "src/components/check-in-flow.tsx",
      "src/components/sidebar-nav.tsx",
      "src/components/bottom-nav.tsx",
    ];
    for (const rel of files) {
      const text = readFileSync(join(process.cwd(), rel), "utf8");
      expect(text, rel).not.toMatch(ban);
    }
  });
});
