import { describe, expect, it } from "vitest";
import { generateOperatorKeyPair, openEnvelope, sealPayload } from "./pack-seal";

const ID_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0011";
const ID_B = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeee0022";

describe("pack seal", () => {
  it("a sealed pack opens with Operator's key to the identical pack", async () => {
    const keys = await generateOperatorKeyPair();
    const pack = { schema: "circadia-study-v1", participantId: ID_A, n: 3 };
    const envelope = await sealPayload(pack, keys.publicRaw, ID_A);
    expect(envelope.v).toBe(2);
    const opened = await openEnvelope(envelope, keys.privateKey, ID_A);
    expect(opened).toEqual({ ok: true, kind: "pack", value: pack });
  });

  it("a different private key cannot open a sealed pack", async () => {
    const a = await generateOperatorKeyPair();
    const b = await generateOperatorKeyPair();
    const envelope = await sealPayload({ n: 1 }, a.publicRaw, ID_A);
    const opened = await openEnvelope(envelope, b.privateKey, ID_A);
    expect(opened).toEqual({ ok: false, error: "Could not open the sealed pack." });
  });

  it("a pack sealed for one participant fails to open as another", async () => {
    const keys = await generateOperatorKeyPair();
    const envelope = await sealPayload({ n: 1 }, keys.publicRaw, ID_A);
    const opened = await openEnvelope(envelope, keys.privateKey, ID_B);
    expect(opened).toEqual({ ok: false, error: "Could not open the sealed pack." });
  });
});
