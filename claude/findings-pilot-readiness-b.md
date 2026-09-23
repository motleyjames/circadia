# Findings - 20260923_175345

**Task:** Pilot readiness B: signup hint from PASSWORD_MIN, one resume line, morning clutter removed, invite message and subject, Operator hides default passphrase, delete off triage, reach errors named, library redirects to help in a test, no baseline wording for testers

**Confidence:** 67%  
**Evidence:** 3 probe(s) established something conclusive against the source.

1 need a person - 3 settled by evidence - 1 open.

## Needs a person

_Evidence CONFIRMED these. The harness is not guessing - each one cites something real in the source._

### d_1_0  (code_reading - loop 1)
> "Delete off triage" may mean "exclude already-deleted items from appearing in the triage queue" rather than "remove the delete button from the triage UI," and implementing the wrong interpretation could silently break triage workflows

Reading the source CONFIRMS this concern. Read src/app/api/moderator/route.ts. The packs array is built from all parsed inbox files without any filtering against the withdrawn records, so already-deleted/withdrawn items remain in the triage queue results. Cited src/app/api/moderator/route.ts:52: `const packs: { file: string; pack: StudyPack }[] = [];`

`probe: read_code__deleted_items_filtering_1209`

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_3  (none - loop 1)
> The PASSWORD_MIN signup hint, if rendered only client-side from a config value, could diverge from actual server-side validation if the config is sourced differently on frontend vs. backend

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_1  (code_reading - loop 1)
> The library-to-help redirect, if implemented with conditional routing logic (e.g., checking a test flag at the route level), could leak into production and break library access for non-test users if the flag defaults incorrectly

Reading the source settles this. Read src/app/library/page.tsx. The page unconditionally renders DiaryPage with no conditional logic, flags, redirects, or environment variable checks present. Cited src/app/library/page.tsx:5: `return <DiaryPage>{null}</DiaryPage>;`

`probe: read_code__library_page_routing_8754`

### d_1_2  (code_reading - loop 1)
> "No baseline wording for testers" may refer to a missing A/B test control variant rather than placeholder copy removal; if so, launching the pilot without a proper baseline makes test results uninterpretable

Reading the source settles this. Read src/app/mod/testers/page.tsx. This file is a single admin/operator page for viewing all testers — it contains no A/B test variant definitions, control arms, or treatment group logic of any kind. Cited src/app/mod/testers/page.tsx:15: `export default function AllTestersPage() {`

`probe: read_code__a_b_baseline_variant_6266`

### d_1_4  (semantic_bridge - loop 1)
> Hiding the default passphrase from the Operator UI via client-side masking alone is insufficient if the passphrase value is still present in API responses or DOM attributes accessible via dev tools

Read src/app/library/page.tsx. The page unconditionally renders DiaryPage with no conditional logic, flags, redirects, or environment variable checks present. Cited src/app/library/page.tsx:5: `return <DiaryPage>{null}</DiaryPage>;`

`probe: read_code__library_page_routing_8754`

**Decisions (James, Sep 23)**
- d_1_0 declined, and the gate misread the task: "delete off triage" means removing the destructive button from the This week view (B7), not filtering data. The underlying worry still doesn't hold. `/api/moderator` returns every parsed pack together with the `withdrawn` list, and `buildConsoleModel` leaves withdrawn and dismissed testers out of This week (`console-model.ts:278`) and marks them "Withdrawn" in All testers. A withdrawal also deletes that tester's pack files; that is tested in `console-model.test.ts`, "a withdrawal deletes that tester's packs and only theirs".
- d_1_1 and d_1_4 settled, but on incomplete evidence: `src/app/library/page.tsx` is only the HTML shell. The redirect lives in `LibraryView`, which returns `HelpView` when `inTheTest(state)` (`library-view.tsx:85`), and it is covered by the B10 render test.
- d_1_2 settled: no A/B variant exists.
- d_1_3 declined: there is no server-side password check. The hint and the validation both read the one constant `PASSWORD_MIN` in `src/lib/password.ts`, on the device, so they cannot drift apart.
