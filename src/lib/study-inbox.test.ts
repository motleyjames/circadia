import { describe, expect, it } from "vitest";
import path from "node:path";
import { studyInboxDir } from "./study-inbox";

describe("studyInboxDir", () => {
  it("uses CIRCADIA_DATA_DIR when set so a packaged app is not stuck inside the .app bundle", () => {
    const prev = process.env.CIRCADIA_DATA_DIR;
    process.env.CIRCADIA_DATA_DIR = "/tmp/circadia-inbox-test";
    expect(studyInboxDir()).toBe("/tmp/circadia-inbox-test");
    if (prev === undefined) delete process.env.CIRCADIA_DATA_DIR;
    else process.env.CIRCADIA_DATA_DIR = prev;
  });

  it("falls back to the repo inbox", () => {
    const prev = process.env.CIRCADIA_DATA_DIR;
    delete process.env.CIRCADIA_DATA_DIR;
    expect(studyInboxDir()).toBe(path.join(process.cwd(), "data", "study-inbox"));
    if (prev !== undefined) process.env.CIRCADIA_DATA_DIR = prev;
  });
});
