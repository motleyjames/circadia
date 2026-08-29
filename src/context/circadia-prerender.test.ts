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
    expect(html).not.toMatch(/Export JSON|Import JSON|Sleep data/);
    expect(html).toMatch(/What we are willing to say/);
  });
});
