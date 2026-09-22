# Findings - 20260922_173532

**Task:** Circadia is local-first, and is being renamed Somnadia. This change renames only what people see; bundle ids, derivation labels, storage keys and origins are frozen.

**Confidence:** 33%  
**Evidence:** 2 probe(s) established something conclusive against the source.

2 need a person - 1 settled by evidence - 2 open.

## Needs a person

_Evidence CONFIRMED these. The harness is not guessing - each one cites something real in the source._

### d_1_0  (code_probe_evidence - loop 1)
> The `package.json` `name` field may feed into filesystem storage paths on some platforms (e.g., Electron's `app.getPath('userData')` defaults to the package name); renaming it would silently relocate the data directory and orphan existing local data, so it must be verified as frozen or explicitly overridden.

Probe 'check_value__package_json_name_field_2297' CONFIRMS this concern: '"name":' appears in package.json at package.json:2 "name": "circadia",. The dissent stands and needs a person.

`probe: check_value__package_json_name_field_2297`

### d_1_1  (code_probe_evidence - loop 1)
> Web app manifest fields `start_url`, `scope`, and `id` may currently contain "circadia" and could be accidentally renamed alongside the user-visible `name`/`short_name` fields, breaking installed PWA identity and causing the OS to treat it as a new app.

Probe 'check_value__hardcoded_circadia_scope_5818' CONFIRMS this concern: 'circadia' appears in src/components/install-hint.tsx at src/components/install-hint.tsx:10 const KEY = "circadia:install-hint";. The dissent stands and needs a person.

`probe: check_value__hardcoded_circadia_scope_5818`

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_2  (none - loop 1)
> Service worker registrations are scoped to origin + path; if any build step derives the SW scope from a string containing "circadia" that gets renamed, existing service workers will become unregisterable and cached data inaccessible.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> OAuth client registrations with identity providers may display "Circadia" on consent screens; updating those display names requires changes in the provider's developer console, not just in code, and may trigger re-review processes that delay the rollout.

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_4  (semantic_bridge - loop 1)
> CRDT document names or Automerge/Yjs sync protocol topic strings containing "circadia" may not be caught by a simple grep if they are dynamically constructed (e.g., template literals or string concatenation), risking a data-lineage fork if accidentally renamed.

'"name":' appears in package.json at package.json:2 "name": "circadia",.

`probe: check_value__package_json_name_field_2297`

**Decisions (James, Sep 22)**
- d_1_0 declined: package.json "name" stays "circadia" by design. It is an identity, not a display name, and was not changed.
- d_1_1 declined: manifest "id", "start_url" and "scope" are unchanged in cf11d35; only "name" and "short_name" changed.
- d_1_2 declined: no service worker exists; grep for serviceWorker in src and public returns nothing.
- d_1_3 declined: Somnadia has no OAuth sign-in.
