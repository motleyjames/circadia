# Prime Directive: Circadia

## Mission

Circadia is a local-first sleep companion for people who **cannot fall asleep, cannot stay
asleep, or both**. The job is a healthy, repeatable schedule — not a shop of powders.

One diary, two shells: `Circadia.app` on the Mac (ice clock, port 43147) and a Capacitor
iPhone wrap of the same diary. A third surface, `Circadia Operator` (gold clock, port 43149),
is James's private inbox and is never in the diary binary.

This is James's own product, owned end to end, held to a commercial bar: user-friendly,
visually appealing, an elite sleep app.

## Data Sources

| System | Role | Integration Method |
|--------|------|--------------------|
| **Local vault (`vault.json`)** | The diary — profile, mornings, consults, chat | AES-GCM at rest; master key in the macOS Keychain (service `Circadia`), never beside the ciphertext |
| **`src/lib/research.ts`** | The library — conservative sleep-science notes | In-repo, no network. Every note stamped `reviewedThrough` |
| **`data/study-inbox/`** | Stripped night packs from opted-in testers | POST to Operator; opt-in once at signup, no Send button afterward |

## Users

- **Primary**: someone who cannot fall asleep, cannot stay asleep, or both — needs a
  repeatable schedule, plain language before sources, and an advisor that will not guess.
- **Secondary**: James as Operator — needs signup counts and sleep statistics against a
  participant number, and must never see names, email, phone, or body measurements.

## Technical Constraints

- Next.js 16 + React, wrapped in a Swift/WKWebView shell as two Dock apps. Not Electron.
- Local-first, absolutely: no cloud account, no company server holding passwords, no reset
  email, no PubMed fetch. If Keychain is unavailable, Circadia stays locked after quit rather
  than writing the key to disk.
- Operator is never in the diary binary. The phone is diary only — never Capacitor-wrap
  Operator.
- Surface isolation lives in `src/proxy.ts` (Next 16 renamed middleware). The diary 404s
  `/mod`; Operator 404s vault, study, and session-key.
- Local HTTP is hostile input. Any page the user has open can send a no-preflight POST to
  127.0.0.1 while Circadia runs. `/api/study` refuses a foreign `Origin` on both servers.
- Never arm the phone open before the scene is active. UIKit completes animations scheduled
  while inactive, so the whole open runs off-screen and the app looks broken.

## Quality Standards

- **The consult engine withholds when it does not know.** Unknown is an answer. No guessing
  past the evidence, no dream dictionaries, no supplement sales.
- Every library note carries `reviewedThrough`. `npm test` fails if a stamp is more than
  twelve months old — that is how the shelf stays current without a network call.
- Night packs never contain name, email, phone, dream text, chat text, medication or
  supplement strings, height or weight, calendar dates, report ids, or IP.
- Motion is deliberate and watchable, not a quick flourish. The open is one piece of
  choreography; Reduce Motion cross-fades rather than dumping the identity on screen.
- `npm test`, `npx tsc --noEmit`, and `npm run build` are all clean before a version ships.

## Domain Vocabulary

| Term | Meaning |
|------|---------|
| **CBT-I** | Cognitive behavioral therapy for insomnia — the first-line approach Circadia is built on |
| **Social jet lag** | The gap between sleep timing on free days and on scheduled days |
| **MSFsc** | Mid-sleep on free days, sleep-corrected — the chronotype measure |
| **Diary** | The encrypted local vault: profile, mornings, consults |
| **Consult** | The advisor surface. Opens empty, answers from diary and library, cites notes, withholds when unknown |
| **Night pack** | A stripped, anonymous record of one morning; leaves the device only for opted-in testers |
| **Roster card** | Participant number, sleep window, struggle flags. No name, email, phone, height, or weight |
| **Operator** | James's private inbox app. Testers never see it |

## Context

- `AGENTS.md` at the repo root carries the hard invariants — read it before changing code.
- `README.md` is the operator's manual for the Dock and phone installs.
- `docs/BLUEPRINT.md` for the design record.
- `meeseeks/box/knowledge/` for harness domain knowledge; add Circadia-specific files there.
