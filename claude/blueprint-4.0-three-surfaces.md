# Circadia — blueprint 4.0: three surfaces

Status: **for review.** Decisions marked ▶. Supersedes the build orders in
`shakedown-spec-2.0.md` and `sync-spec-3.1-account-model.md`, which remain the source of
truth for their own designs. Visual reference: the **Circadia Clinician Console** design
canvas.

## What changed

Circadia was built as a sleep companion: one person, one diary, their own device. The
clinical reshape added episodes and clinician-authored windows, but still treated the
product as one app.

It is three products that share a data model:

| Surface | Who | When | Job |
|---|---|---|---|
| **Patient app** | the person with insomnia | 3 am and 7 am | file tonight, follow the window |
| **Clinician console** | a behavioral sleep medicine clinician | 2 pm, between patients | decide the next window |
| **Diary export** | anyone the patient shows it to | a first appointment | stand alone as a clinical document |

A clinician deciding whether to adopt Circadia evaluates all three in one meeting: what
their patient will see, what they will see, and what the output looks like on paper. Each
must be designed for its own context. The console is not the night app with the lights on.

---

## Principles

### 1. The console is a decision surface, not a dashboard

CBT-I runs a weekly loop: review the diary, compute sleep efficiency, then extend, hold or
restrict the prescribed window. Every patient, every week, one decision. Everything else
on screen is evidence for it.

So the home screen is a **triage queue** answering *who needs me this week, and why* —
ranked, never alphabetical:

1. **Safety** — witnessed apnea, drowsy driving, from `safety-triage.ts`
2. **Adherence** — mornings not filed, in bed outside the window
3. **Decision due** — weekly review, evidence ready
4. **Holding steady** — nothing needed

No headline metrics row. Aggregate numbers across patients answer a question no clinician
is asking.

### 2. Never suggest the titration

The console shows sleep efficiency at 90% for seven nights. It does **not** say "extend by
15 minutes," "consider extending," or colour the number green past a threshold.

[WHY: a suggestion the clinician approves is a prescription with extra steps. It is the
line between an instrument a psychologist trusts and a tool they reject, and it is what
keeps Circadia out of FDA software-as-a-medical-device territory.]

The console states this plainly beside the decision:

> Circadia shows the evidence. The window is yours to set.

That sentence is a design element, not a disclaimer. It tells a clinician in one line that
the product was built by someone who understood their job.

### 3. Freshness is always visible

Local-first means the console only ever sees what a patient's device has pushed. Every
patient row carries **last synced**. Nothing implies a live feed.

[WHY: a console designed as a real-time view is a console designed for an architecture
Circadia does not have. The honest version is also the one that survives a clinician asking
"is this current?"]

### 4. The patient app is an instrument, not a tracker

A tracker feels optional; an instrument feels like something you owe your attention to.
That difference shows up directly in completion rate — the metric the shakedown exists to
measure.

The central object of the patient's evening is **the prescribed window**, authored by a
named clinician, with their note in their words. Not a countdown, not a score, not a streak.

### 5. One product family, two contexts

| | Patient app | Console |
|---|---|---|
| Ground | night, `#0C0A18` | daylight paper, `#F4F5F7` |
| Display | Fraunces | Fraunces |
| Text | Outfit | Instrument Sans, tabular figures |
| Accent | violet | violet |

Fraunces and violet carry the family. Everything else answers to its context.

---

## How data reaches the clinician

The console needs night geometry to draw anything. Today it has none of it.

**A known gap, now blocking.** `NIGHT_KEYS` in the study pack omits `inBedAt`,
`triedToSleepAt`, `outOfBedAt`, `awakeningCount` and `napMinutes`. Packs still carry
pre-0.10.0 geometry, so **no pack collected so far can draw a raster or compute sleep
efficiency.** This was found in Stage 1's Phase 0 and never fixed. It is now the first
prerequisite for the console.

**Two phases of data flow:**

**Shakedown.** James is the clinician. Records reach Operator the way study packs do now —
extended with the geometry above. Operator becomes the console.

**Clinic.** A patient's consented, scoped clinical record is encrypted to the **clinic's
public key** on the patient's device and stored through the existing Worker as a third
object kind. The Worker stays dumb — invariant 9 of 3.1 already guarantees it cannot tell
object kinds apart. The clinic's console decrypts with a key only the clinic holds.

▶ **Key scheme for the clinic record.** WebCrypto supports ECDH and RSA-OAEP; choose one
and a rotation story before the first clinic pilot, not before the shakedown.

---

## Compliance: a correction

Earlier specs described "the server holds only ciphertext" as keeping the compliance
surface near zero. **That is true for the shakedown and false for any clinic.**

HHS guidance on cloud computing is explicit: a service that stores encrypted ePHI on behalf
of a covered entity is a business associate **even without the decryption key**. HHS calls
this a "no-view service," and it still requires a business associate agreement.

| Phase | Covered entity involved | HIPAA |
|---|---|---|
| Shakedown, direct volunteers | no | outside HIPAA |
| First clinic pilot | yes — the clinic | Circadia is a business associate |

Local-first remains the advantage — smaller breach impact, a stronger trust story, a better
pitch. It is not an exemption.

▶ **Before the first clinic pilot:** a BAA, a written security policy, breach notification
procedure, and one hour with a lawyer who does health tech. Not before the shakedown.

▶ **Check whether the FTC Health Breach Notification Rule applies to the shakedown.** It
covers some consumer health apps outside HIPAA. Unverified here; worth ten minutes before
strangers enroll.

---

## The patient app: from tracker to instrument

An audit against real screens is still owed — nothing below has been checked against the
running app. Look for:

- **Tonight built around a countdown.** Rebuild around the window and who set it.
- **Anything that reads as a score** or invites comparison night to night.
- **Notification copy** like "your week is in" — consumer tone.
- **Copy that sounds like a wellness brand** rather than a clinical instrument.
- During baseline, **before any window exists**, Tonight shows the protocol instead: "Night
  6 of 14 in your baseline."

▶ **Do testers see their own sleep efficiency during baseline?** Carried from 2.0 and still
open. Clinicians withhold it because seeing it changes behaviour; an app that shows
nothing for fourteen nights gets abandoned. The mockup shows the window and filing status
only.

---

## The export

The document a patient brings to a first appointment, and the one a clinician reads
without the app. It must work in black and white, on paper, with no explanation.

- The 14-night raster, same visual language as the console
- TIB, TST and sleep efficiency per night, weekly means and SD
- Sleep midpoint and variability
- PROMIS trajectory
- Medications and supplements as recorded
- Back-filled nights visibly marked
- Triage flags raised during the period
- No free text. Nothing the patient did not choose to include.

Browser print stylesheet to PDF. Nothing leaves the device.

---

## Build order

Unified across all specs. Each item ships independently and goes through the mutation
harness and the gate.

### Phase A — ready for the shakedown

1. **Night geometry into the clinical record.** The `NIGHT_KEYS` gap. Nothing downstream
   works without it.
2. **Recovery, release two.** Both surfaces pass `previous` into `rewrapLock`. Until then a
   password change on the un-updated phone silently kills recovery.
3. **Solo enrollment.** Nullable `clinicianId`, cohort tag, invite codes.
4. **Intake battery.** STOP-BANG, PROMIS SD and SRI.
5. **Operator becomes the console.** Queue and patient review, built from the canvas.
6. **The export.**
7. **Patient app, tracker to instrument.** Audit first, against real screenshots.
8. **Consent copy.** Plain language, a real decline path, and data disposition at the end.
9. **Completion instrumentation.** Nights filed over nights elapsed, per cohort.

### Phase B — the clinic demo

The console in sample-patient mode, the export, and the patient app. Walked in that order:
*here is your queue, here is one patient, here is what they see, here is what they bring you.*

### Phase C — the first clinic pilot

The clinic-keyed clinical record, multi-clinic support, and everything in the compliance
section.

### Deferred, deliberately

**Sync** — account creation, first sync, password change moving the record, conflict
copies. The Worker is deployed and the account model is built, but **most shakedown testers
use one device.** Sync is not on the critical path to the shakedown. It resumes after
Phase A.

---

## Blockers that are not code

1. **The Consensus Sleep Diary licence.** Every night collected from a real person is
   collected under this open question. Before the first tester.
2. **FTC Health Breach Notification Rule** applicability, for the shakedown.
3. **BAA and legal hour**, before the first clinic.

## Anti-goals

- **No titration suggestions.** Not as a default, not as a hint, not as a colour.
- **No aggregate metrics** on the console home.
- **No implied live data.** Every figure carries its sync time.
- **No proprietary sleep score.** Carried from 1.0.
- **No streaks or guilt** in the patient app. Carried from the notification rules.
- **No crisis escalation to James.** Carried from 2.0, invariant 7.
