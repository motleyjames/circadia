import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
});
