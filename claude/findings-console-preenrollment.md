# Findings - 20260921_212121

**Task:** Circadia is local-first. Review a rebuilt console test: an enrolled fixture with three pre-enrollment nights at 40% and four episode nights at 90%, asserting the section, the exact 14-slot strip and every bar's height. The mutation row console-draws-preenrollment is unchanged.

**Confidence:** 45%  
**Evidence:** 0 probe(s) established something conclusive against the source.

0 need a person - 0 settled by evidence - 4 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> The assumed slot distribution of 7 empty + 3 preenrollment + 4 episode = 14 may be wrong if the strip is anchored to the current date or uses reverse-chronological ordering, which would place empty slots on the right rather than left.

No resolution strategy could handle this dissent

### d_1_1  (none - loop 1)
> Bar height quantization (e.g., 40% → 4 on a 0–10 scale) is assumed but the production code may use a different scale (e.g., 0–8 for Unicode block characters), which would make exact assertions incorrect.

No resolution strategy could handle this dissent

### d_1_2  (none - loop 1)
> The `console-draws-preenrollment` mutation may target slot-type styling (e.g., ANSI color or glyph shape for pre-enrollment vs episode) rather than bar height or slot presence, meaning height-only assertions would fail to kill it.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> If the fixture uses wall-clock-relative dates (e.g., "3 days ago") rather than absolute timestamps, the test could become flaky across midnight boundaries or in CI environments with different timezones.

No resolution strategy could handle this dissent
