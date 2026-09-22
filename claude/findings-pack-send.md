# Findings - 20260922_124649

**Task:** Circadia is local-first. Review the sending half of pack transport: the phone keeps a v2 invite only in its encrypted vault, switches its participant id to the v2 id, seals each pack to Operator's public key built in at build time, and delivers it through Capacitor's native HTTP to the Worker, registering once and then writing with If-Match. It sends once on joining and after each filed morning; f

**Confidence:** 47%  
**Evidence:** 0 probe(s) established something conclusive against the source.

0 need a person - 0 settled by evidence - 4 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_1  (none - loop 1)
> Withdrawal-on-leave can silently fail if the network is down and the user never reopens the app, meaning the Worker will never learn the participant left and may continue to accept or expect packs.

No resolution strategy could handle this dissent

### d_1_2  (judgement - loop 1)
> Queued packs created before the v2 participant ID migration may be sent with the old ID if the outbox drain/re-tag step is not implemented atomically with the ID swap, causing the Worker to reject or misattribute them.

The concern is about a backend outbox/worker participant-ID migration pattern that does not correspond to any file or symbol present in the repository facts, making it impossible to scope a meaningful

### d_1_3  (none - loop 1)
> On iOS, Capacitor native HTTP requests initiated just before OS suspension will be killed mid-flight; without `BGTaskScheduler` or equivalent, packs in `InFlight` state may never transition to `Delivered` or `Failed` and will appear silently stuck.

No resolution strategy could handle this dissent

### d_1_4  (none - loop 1)
> A single hardcoded Operator key with no rotation mechanism means a key compromise requires an emergency app release to all users; shipping without even a two-key keyset creates incident-response risk.

No resolution strategy could handle this dissent
