# Circadia — clinical reshape, spec v1.0 (design, not yet built)

Status: **for review.** No code written. Decisions James needs to make are marked ▶.
Field names below are *shapes*, not verified identifiers — every one needs reconciling
against the real files before implementation (see "What I need to see").

Companion to `sleep-data-spec-1.0.md`, which gave the diary a denominator. This one
gives it a recipient.

---

## The inversion

Everything in this document follows from one decision:

> **Circadia is the instrument. The clinician is the prescriber.**

Sleep restriction works and is genuinely dangerous self-administered — contraindicated in
bipolar disorder, seizure disorders, untreated apnea, and professional drivers. The
`week-sentence.ts` test that pins "never prescribe a sleep window" stays, and stops being
purely a safety rule: it becomes the product's commercial position. An app that titrates a
window competes with a psychologist and will be rejected by every one of them. An app that
executes *their* prescription and reports adherence is something they will pay for.

This is also the line against every competitor. CBT-i Coach shows the patient sleep
recommendations derived from their last five diary entries. Zomni adjusts the window daily
by AI. Both self-titrate. Refusing to is the differentiator, not a limitation.

---

## 1. The episode

The single biggest structural change. Today the diary is an open-ended consumer habit —
Tonight, forever. Clinically it is a bounded protocol with a state machine.

```
enrolled → baseline → review → treatment → maintenance → discharged
                         ↑         ↓
                         └─────────┘   (weekly review cycle)
```

| State | Meaning | Home screen |
|---|---|---|
| `enrolled` | Invite accepted, intake battery not complete | "Let's set you up" |
| `baseline` | Filing nights, no window prescribed | **"Night 6 of 14"** |
| `review` | Baseline complete, awaiting clinician | "Your clinician has your nights" |
| `treatment` | A `TreatmentWindow` is active | Countdown to *prescribed* bedtime |
| `maintenance` | Window retired, still filing | Tonight, as today |
| `discharged` | Episode closed, record frozen | Read-only history |

Progress toward a review a real person is waiting for is a far stronger adherence driver
than a streak — and streaks are already ruled out, correctly, by the notifications regex.

▶ **Baseline length.** 14 nights is the clinical convention and what the export is built
around. But a clinician may want 7 to start treatment sooner. Fixed at 14, or
clinician-set at enrollment?

▶ **Can a patient exist without a clinic?** Keeping a solo mode means maintaining two
products. Dropping it means abandoning your existing users. My lean: keep solo mode as
`episode: null`, which is exactly today's behaviour, and let clinical features light up
only when an episode exists. Costs one branch, keeps the app you already have.

## 2. `TreatmentWindow` — the type the app may never author

```ts
type TreatmentWindow = {
  prescribedInBed: ClockTime;
  prescribedOutOfBed: ClockTime;
  setBy: ClinicianId;
  setAt: IsoTimestamp;
  rationale?: string;       // clinician's words, shown to the patient verbatim
  supersedes?: WindowId;    // weekly titration chain
};
```

**Invariant:** no code path constructs a `TreatmentWindow` from computed data. Pin it the
same way `phone-shell.test.ts` pins `isLocalRequest` — a test that greps the source for
construction sites and asserts every one traces to a clinician input.

What it unlocks: Tonight finally has real work. Countdown to the prescribed bedtime rather
than a derived one. The morning shows **adherence to window** beside SE — the two numbers a
CBT-I clinician reads together, because SE rising while adherence falls means the patient
quietly widened their window.

## 3. Splitting the vault

The local-first stance bends here, but does not break. Two stores:

**Personal vault** — unchanged. AES-GCM, wrapped key, on-device. Dreams, free text,
everything. The clinic can never read it. This is the 0.12.0 work, untouched.

**Clinical record** — scoped, consented, revocable, synced to the clinic. Diary geometry,
instrument scores, adherence, triage flags. **No free text, ever.**

You already built this pattern. The study pack has an allowlist, `TOP_KEYS`, and an
anonymity scan. Generalise it from "anonymous research pack" to "identified clinical record
with one named recipient." The consent screen names the clinic and lists the exact fields
that leave the device — reuse the allowlist as the source of that list so it cannot drift
from what is actually sent.

▶ **Transport.** Encrypted blob sync (item 3 on the 0.12.0 next-list) is the clean answer
but is real infrastructure. The cheap answer for pilot one: the patient taps "send to my
clinic," which produces the PDF and a signed JSON, delivered however the clinic already
receives documents. No server, no BAA, no HIPAA surface. **My strong lean: ship the cheap
answer first.** See §8.

## 4. Intake battery

At enrollment, once:

| Instrument | Measures | Licence |
|---|---|---|
| Epworth Sleepiness Scale | Daytime sleepiness | ⚠ copyrighted |
| STOP-BANG | Apnea risk | Free |
| PROMIS Sleep Disturbance 4a/6a | Insomnia severity | Public domain |
| PROMIS Sleep-Related Impairment | Daytime half | Public domain |

Weekly: PROMIS SD only. Same weekday, ~90s, skippable — as `sleep-data-spec-1.0` already
specifies.

Epworth is copyrighted on the same footing as ISI. ▶ Ship STOP-BANG + PROMIS only for v1
and add Epworth if licensed? My lean: yes. STOP-BANG carries the apnea screen alone and
costs nothing.

This battery is what makes Circadia legible as an *intake instrument* rather than a
wellness app. It is also cheap: four questionnaires, no new data model beyond a scores
table.

## 5. Triage becomes referral

`safety-triage.ts` already catches witnessed apnea, drowsy driving, mania, alcohol
dependence, and the minor-dosing gate. Today those decline to answer. In an episode they
should **also raise a flag on the clinician's queue**, with the date and the category — not
the patient's words.

This is the commercial argument that opens the door. A patient reporting witnessed pauses
in breathing inside an insomnia caseload is an apnea workup the clinic can bill. COMISA is
common enough that this is not a stretch. Your safety module becomes revenue-positive to
the buyer.

**Flag categories leave the device; patient free text does not.** Non-negotiable.

## 6. The library becomes assigned

Same 35 notes, different verb. The clinician pushes `sleep-pressure` and `racing-mind` as
week-two homework; the patient sees them queued with a read receipt. Browse stays as the
fallback for everything else.

Cheap to build — an array of note ids on the episode — and it converts a browsable
reference into treatment delivery the clinician controls.

## 7. Operator becomes the console

Do not build a new app. Operator already has a multi-participant inbox with fault
detection. It needs:

- Patient list with episode state and **completion rate** — the number clinics judge you on
- The 14-night grid per patient
- A form to set a `TreatmentWindow`
- The triage flag queue
- The PDF export

Multi-tenant comes later. A single-clinic install is fine for pilot one, and Operator is
already exactly that.

## 8. Migration — the part that can break real data

Same discipline as `sleep-data-spec-1.0` §Migration and the 0.12.0 lock migration.

1. `episode` is **optional** on the stored state. Absent means today's behaviour, exactly.
2. `coerceReport` and `hydrateState` unchanged in shape; new fields fill `undefined`.
3. Existing users land in solo mode and notice nothing. No forced enrollment.
4. **Never synthesise an episode from existing nights.** A back-dated baseline would put a
   patient into `review` with data collected under different instructions.
5. The clinical record allowlist starts empty and is populated per-field with a test
   asserting no field reaches it without an entry — the study-pack pattern.
6. Adherence is `null` for every night before a window existed. Not zero. Not 100%.

**The trap, by analogy to the 0.12.0 `kdf: 2` decision:** Mac and phone fold into each
other and one updates first. An episode-aware phone folding into a pre-episode Mac must not
lose the episode, and a pre-episode Mac folding into the phone must not blank it. Carry
episode state as an additive field the old fold ignores, and test both directions before
shipping either.

## 9. Invariants to pin by test

Each of these is a greppable source assertion in the style you already use:

1. No `TreatmentWindow` is constructed from diary-derived data.
2. No free-text field appears in the clinical record allowlist.
3. Triage flags carry a category, never the patient's words.
4. `week-sentence.ts` still never prescribes a window (existing test, keep).
5. Adherence is `null`, never a number, for nights with no active window.
6. An episode is never created without a clinician id.
7. `reports.length === 0` never returns to the notification gate (existing, keep).

## 10. Anti-goals

Carried forward from `sleep-data-spec-1.0`, plus:

- **No proprietary sleep score.** Unchanged.
- **No automated window titration**, even "as a suggestion the clinician approves." A
  suggestion is a prescription with extra steps, and it is the exact thing that makes a
  psychologist distrust the product.
- **No free-text sync.** Ever.
- **No forced migration** of existing solo users into an episode.
- **Do not delete the open animation.** Professional is not sterile, and it took three
  versions to get right.

## 11. Blockers that are not code

Ordered by how expensive they get if deferred.

1. **▶ Consensus Sleep Diary licence.** consensussleepdiary.com states it is free for
   not-for-profit use and that industry or for-profit use requires permission from the
   first author. The CSD item set is under your core data model and you intend to sell to
   clinics. Email Carney. One paragraph, probably fine or cheap, catastrophic to discover
   after a clinic depends on you. **Do this before writing any of the above.**
2. **Claims language.** "Helps you sleep" is wellness. "Treats insomnia" is a medical
   device. Audit every string in the app against that line before a clinician sees it.
3. **HIPAA.** The moment identified patient data reaches a clinician through infrastructure
   you run, you are a business associate. §3's cheap transport avoids this entirely for
   pilot one — which is most of why it is the right call.
4. **Epworth licence**, if you want it.

## 12. Build order

Stages 1–3 and 5 are a complete pilot. 4 and 6 can wait for a clinic that asks.

1. **Episode state machine + `TreatmentWindow` + migration.** No UI. Fully testable in
   isolation, same as 0.10.0's `sleep-metrics.ts`.
2. **Clinical record split + allowlist + consent screen.**
3. **Intake battery** (STOP-BANG, PROMIS SD, PROMIS SRI).
4. **Operator → console.**
5. **14-night PDF export.** Browser print stylesheet, no server.
6. **Assigned library.**

Each ships independently and leaves the app working.

▶ **Worth asking a clinician before building stage 4:** would they rather have a portal or
a PDF in their inbox? A portal means HIPAA, BAAs and multi-tenancy. A PDF means almost
none of it. If the PDF is enough for the first ten clinics, build only the PDF.

## 13. Also fix before any pilot

**Back-fill a missed morning.** Currently only today's can be filed, so in a bounded
14-night baseline a missed morning becomes a permanently missing night. That is the defect
most likely to make a clinician distrust the data. Add it, with an explicit `filedLate`
marker so the grid can show which nights were reconstructed — a clinician needs to know the
difference and a patient needs the gap not to be fatal.

---

## What I need to see to write stage 1

Blind types would be guesswork. To implement rather than sketch:

- `src/lib/types.ts` (or wherever `MorningReport`, `LatencyBucket`, `ClockTime` live)
- `src/lib/store.ts` — `coerceReport`, `hydrateState`, `saveState`, `addReport`
- `src/lib/sleep-metrics.ts` and `nightGeometry`
- The study-pack allowlist — `TOP_KEYS`, validators, anonymity scan
- `src/app/api/study/route.ts` and `electron/static-server.cjs` (the two validators still
  differ)
- Operator's entry point and inbox reader
- `AGENTS.md`

A `git ls-files` plus those files pasted in is enough to start. Or re-open this on the
bridge where the repo is mounted.
