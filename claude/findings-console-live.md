# Findings - 20260921_210840

**Task:** Circadia is local-first. Review Operator console fixes from live data: pre-invite testers assigned to Not enrolled, naming an orphan without minting a code, dismiss, an All testers page, invite codes that stay findable, sending a code by Messages or Mail without storing the phone or email, and a launcher.swift allowlist of exactly sms, mailto and tel that also repairs the previously dead 988 link.

**Confidence:** 60%  
**Evidence:** 1 probe(s) established something conclusive against the source.

0 need a person - 1 settled by evidence - 3 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_1  (none - loop 1)
> If the existing codebase used invite code existence as a proxy for enrollment status (i.e., `hascode == isEnrolled`), the migration backfill to `notEnrolled` may incorrectly reclassify testers who were genuinely enrolled but whose code records were lost or corrupted — a reconciliation check against redemption evidence is needed before bulk backfill.

No resolution strategy could handle this dissent

### d_1_2  (none - loop 1)
> The `tel:` scheme validator fix for 988 could inadvertently allow malformed or abusive short dial strings (e.g., `tel:1`, `tel:0`) if the only validation is "3+ digits" — an explicit N11/emergency shortcode allowlist (`["911","988","211","311","411","511","611","711","811"]`) would be safer than a permissive digit-length regex.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> Constructing `sms:<number>&body=<code>` inline may fail silently on devices without an SMS plan or on iPads without cellular — the launcher should handle the `open` completion handler's `success: Bool` and surface a fallback to the operator.

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_0  (code_reading - loop 1)
> The ephemeral send flow may still leak recipient data into iOS `RecentActivities`, `NSUserActivity`, or system-level URL open logs outside the app's control — the app can only guarantee non-persistence within its own sandbox, not at the OS level.

Reading the source settles this. Read src/components/send-invite-code.tsx. The component uses standard web APIs (navigator.clipboard, window.location.assign with sms:/mailto: URIs) and does not use any iOS NSUserActivity, UIActivityViewController, universal links, or system share sheet APIs. Cited src/components/send-invite-code.tsx:20: `window.location.assign(href);`

`probe: read_code__ios_os_level_data_leakage_7681`

---

## Declined, with reasons (James, 2026-09-21)

**Code presence as a proxy for enrollment (d_1_1).** Nothing reads it that way:
enrollment is nightsElapsed, and a named orphan's null code is expected. Declined.

**Abusive tel: dial strings (d_1_2).** The allowlist is by scheme, and tel: links
come only from the app's own authored pages, never untrusted content. Declined.

**sms: failing without an SMS plan (d_1_3).** The message is always copied to the
clipboard as well, so delivery never depends on Messages. Declined.

## Mutation finding

console-draws-preenrollment survived after the Not enrolled section was added.
Fixed in a follow-up by rebuilding the fixture as an enrolled tester and asserting
its precondition.

**Correction:** the cause above was a first guess, and it was refuted. The fixture
was already enrolled. The mutant drew a pre-enrollment night at nightIndex 0, the
slot episode night 0 also uses, and the episode night overwrote it, so a check that
only looked at shape still passed. The fix gives pre-enrollment nights 40% efficiency
against 90% for episode nights and asserts every bar's height. See
findings-console-preenrollment.md.
