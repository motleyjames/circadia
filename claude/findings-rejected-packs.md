# Findings - 20260921_215031

**Task:** Circadia is local-first. Review a fix for nine valid study packs shown as rejected. validateStudyPack's night-clock check moved from isClock to isWallClock with normalizeClock; Operator's reject log is rebuilt from packs that still fail instead of only growing; arrival rejects are kept; remaining rejects are grouped by reason. The Dock now checks fellAsleepAt and wokeAt like the Next route. Out-of

**Confidence:** 45%  
**Evidence:** 0 probe(s) established something conclusive against the source.

0 need a person - 0 settled by evidence - 5 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> `normalizeClock` may produce negative durations or false out-of-range rejections for overnight sleep spans crossing midnight (e.g., fellAsleepAt 23:30 → wokeAt 06:30) if it does not explicitly handle the date-boundary wrap

No resolution strategy could handle this dissent

### d_1_1  (none - loop 1)
> The Dock's fellAsleepAt/wokeAt validation may be duplicated code rather than a call to a shared validator, which will drift from the Next route's logic in future changes

No resolution strategy could handle this dissent

### d_1_2  (none - loop 1)
> Replacing the append-only reject log with a rebuilt log may silently drop historical rejection events needed by telemetry or diagnostic replay systems

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> The reject-log rebuild may not be idempotent or stable under concurrent pack arrivals in the local-first sync layer, producing flickering reject state

No resolution strategy could handle this dissent

### d_1_4  (none - loop 1)
> `isWallClock` may accept `24:00` or locale-formatted times (e.g., `11:30 PM`) that `normalizeClock` does not handle, widening the acceptance surface beyond intent

No resolution strategy could handle this dissent

---

## What actually happened (James, 2026-09-21)

Both causes were real. validateStudyPack rejected these nights: its night-clock
condition used isClock, replaced by isWallClock with normalizeClock. Separately,
Operator's read-side reject log was sticky and never dropped a pack once it parsed.

The report said read only. That is wrong: validateStudyPack also guards
POST /api/study, so between bfefc9b and this fix a pack like these would have been
refused on arrival. Nothing was lost — no pack arrived in that window, and the
arrival reject log is empty. The Dock now checks fellAsleepAt and wokeAt, matching
the Next route.
