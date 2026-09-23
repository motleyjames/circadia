# Findings - 20260923_171734

**Task:** Clinical surface for anyone in a test: tabs Today, Record, Help, You; no meditations, noise, Library, Consult, chronotype or sleep-need lines; Record shows raw answers only; new brand line on the phone open

**Confidence:** 60%  
**Evidence:** 1 probe(s) established something conclusive against the source.

0 need a person - 1 settled by evidence - 3 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> Runtime config without a separate build flavor risks feature bleed if a single guard fails — excluded modules' code is still present in the binary, and a misconfigured flag or unguarded code path could expose meditations, Library, or derived metrics to clinical participants, violating study protocol.

No resolution strategy could handle this dissent

### d_1_2  (none - loop 1)
> If chronotype or sleep-need computations run as background jobs or are stored in shared local databases, suppressing them from the UI alone does not prevent the participant from discovering them via device-level inspection (e.g., app database files), which could constitute a protocol violation in strict clinical settings.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> The splash-screen brand line insertion may cause a visible UI flash or delay first meaningful paint if the remote config fetch is on the critical path and the network is slow — a hardcoded fallback string should be bundled in the client.

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_1  (code_reading - loop 1)
> Enforcing "raw answers only" purely at the client layer (without a dedicated backend endpoint or server-side mode) would allow derived metrics to be returned in API responses and potentially cached locally, leaking algorithmic outputs even if the UI doesn't render them.

Reading the source settles this. Read src/app/api/study/route.ts. The POST response returns only status fields (ok, stored, forwarded, kind) — no raw data or computed/derived metric fields from the parsed payload are included in the response sent to the client. Cited src/app/api/study/route.ts:78: `return NextResponse.json({ ok: true, stored: true, forwarded, kind: parsed.kind });`

`probe: read_code__server_side_metric_filtering_1883`

**Decisions (James, Sep 23)**
- Gate note: d_1_1 was marked "settled" by reading `src/app/api/study/route.ts`, which is not where Record gets its data. This is the fourth change in a row where the gate read an unrelated file. The real answer: Record renders her stored answers and computes nothing. Derived metrics are computed only in Operator, from packs.
- d_1_0 accepted in part: the in-test surface rests on one guard, `inTheTest()` in `src/lib/in-the-test.ts`. It is used by the nav, sidebar, app shell, Today, Record and You, and the clinical-diary render tests cover every state. But `/library` does not check it, so the route still renders if it is reached directly. No link to it exists in a test, and neither the phone app nor the Mac app has an address bar. Readiness B adds a redirect from `/library` to `/help` while in a test, as belt and braces. A separate build flavor is declined: the pilot is small and every surface is tested.
- d_1_2 declined: chronotype is a draft-only value that is neither stored on the profile nor sent. Sleep-need is a display line, not a stored computation. Everything in the vault is her own encrypted diary, so her seeing her own data on her own device is not a protocol breach. The observation rule is about what the app shows her.
- d_1_3 declined: there is no remote config. The brand line is compiled into `brand-stage.tsx` and `SceneDelegate.swift`, so nothing is fetched on the way to the first screen.
