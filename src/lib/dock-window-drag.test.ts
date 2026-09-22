import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Dock window drag", () => {
  it("both windows configure a drag region, exclude interactive elements, and keep the title bar hidden", () => {
    const install = readFileSync("electron/install-both-native.cjs", "utf8");
    const kinds = readFileSync("electron/native-bundle.cjs", "utf8");
    expect(install).toContain("launcher.swift");
    expect(install).toContain("One swiftc. Two bundles. No Electron.");
    expect(kinds).toContain("Somnadia.app");
    expect(kinds).toContain("Somnadia Operator.app");
    expect(kinds).toContain("Never wrap Electron.");

    const shell = readFileSync("electron/launcher.swift", "utf8");
    expect(shell).toContain("titlebarAppearsTransparent = true");
    expect(shell).toContain("titleVisibility = .hidden");
    expect(shell).toContain(".fullSizeContentView");
    expect(shell).not.toContain("titleVisibility = .visible");
    expect(shell).toContain("circadiaDrag");
    expect(shell).toContain("window.performDrag(with: event)");
    expect(shell).toContain("window.zoom(nil)");
    expect(shell).toContain("closest('.native-drag')");
    expect(shell).toContain('[role="button"]');
    expect(shell).toContain("h.postMessage({clicks:e.detail})");

    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("html.circadia-native .native-drag");
    expect(css).toContain("-webkit-app-region: drag");
    expect(css).toContain("-webkit-app-region: no-drag");
    expect(css).toContain("html.circadia-native a,");
    expect(css).toContain("html.circadia-native button,");
    expect(css).toContain("html.circadia-native input,");

    const chrome = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(chrome).toContain("native-drag");
    expect(chrome).toContain("isOperatorSurface()");
    const diaryStrip = chrome.slice(chrome.indexOf("function Stage"), chrome.indexOf("type OpenCoverPhase"));
    expect(diaryStrip).toContain("native-drag");
    const operatorStrip = chrome.slice(chrome.indexOf("isOperatorSurface()"));
    expect(operatorStrip).toContain("native-drag");
  });
});
