# Findings - 20260922_130644

**Task:** Circadia is local-first. Review a fix to episodeNight: a morning now counts as the night before it, in local civil dates, so a first morning lands in slot 0 and a morning on the enrollment day carries no slot. The phone keeps a hash of the last pack the Worker accepted and resends on open only when the pack changed.

**Confidence:** 47%  
**Evidence:** 1 probe(s) established something conclusive against the source.

0 need a person - 0 settled by evidence - 4 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> If the cutoff hour is not explicitly defined in the code and tests, timestamps near the boundary (e.g., 11:59 vs 12:01 local) will produce inconsistent slot assignments depending on device clock skew.

No resolution strategy could handle this dissent

### d_1_1  (judgement - loop 1)
> If `JSON.stringify` is used without sorted keys for pack hashing, non-deterministic property ordering across serialization calls will cause false hash mismatches and unnecessary Worker resends on every app open.

The concern references 'pack hashing' and 'Worker resends' but no file in the listed modules corresponds to this functionality, making it impossible to scope a meaningful probe to the correct file.

### d_1_3  (none - loop 1)
> If pack size grows unboundedly with user history, the hash computation and resend payload on app open will degrade performance over time; the current design may need pack windowing or delta-based sync.

No resolution strategy could handle this dissent

### d_1_4  (none - loop 1)
> If episodeNight uses UTC-based date extraction (e.g., `new Date().toISOString().slice(0,10)`) instead of local civil date resolution, slot assignments will be wrong for users in negative-UTC-offset timezones during evening hours.

No resolution strategy could handle this dissent
