# Findings - 20260921_200240

**Task:** Circadia is local-first. Operator home is rebuilt as the shakedown console: a pure console-model turns packs, the invite book and the clock into one view model; a tester appears in exactly one section; invites and exports live on their own pages; no design sample data ships. Also changed: operator-session.ts, operator-gate.tsx and the moderator API route, to protect the new routes. Every Operator 

**Confidence:** 69%  
**Evidence:** 0 probe(s) established something conclusive against the source.

0 need a person - 4 settled by evidence - 10 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> The local-only check using `req.socket.remoteAddress` will report the proxy's IP, not the client's, if Circadia runs behind any reverse proxy (including local nginx or Docker networking), silently allowing remote access or silently blocking legitimate local access.

No resolution strategy could handle this dissent

### d_1_1  (none - loop 1)
> Stripping all sample/design data from the production bundle may cause runtime errors or blank screens on first cold start if any component implicitly depends on seed data for initial hydration or schema initialization.

No resolution strategy could handle this dissent

### d_1_2  (none - loop 1)
> The tester-uniqueness invariant (exactly one section) has no specified precedence rule in the task description; implementing an arbitrary priority order without product confirmation risks placing testers in the wrong section.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> If `operator-gate.tsx` performs the local-only check client-side only (e.g., via a fetch to a health endpoint), it can be bypassed by directly calling the API routes; the server-side `requireOperatorAccess` middleware must be the authoritative check, not the component gate.

No resolution strategy could handle this dissent

### d_2_0  (none - loop 2)
> The local-only check, if implemented as pure loopback IP matching (`127.0.0.1`/`::1`), will reject legitimate operator access from other devices on the same LAN, which may be a valid Circadia deployment scenario

No resolution strategy could handle this dissent

### d_2_1  (none - loop 2)
> The runtime invariant check for tester uniqueness across sections may throw in production if upstream data sources legitimately associate a tester with multiple lifecycle states simultaneously (e.g., active in one pack, pending in another), causing a console crash rather than graceful degradation

No resolution strategy could handle this dissent

### d_2_2  (judgement - loop 2)
> The CI check for sample/mock data removal via string matching (grep for `sample`, `mock`, `seed`) may produce false positives on legitimate code identifiers or test utilities that are correctly excluded from production bundles by tree-shaking

The concern is about a CI grep script that does not appear in the repository's listed files, making it impossible to scope any probe to the actual artifact under question; the concern is also partly a

### d_3_0  (none - loop 3)
> The local-only check in operator-session.ts or operator-gate.tsx may rely on request headers (e.g., X-Forwarded-For, Host) rather than the actual TCP socket remote address, which would allow bypass via header spoofing when the server is network-reachable

No resolution strategy could handle this dissent

### d_3_1  (none - loop 3)
> The console-model's tester partitioning may not enforce disjoint assignment during concurrent or rapid state transitions (e.g., a tester moving from Pending to Active could momentarily appear in two sections if the view model reads stale partial state)

No resolution strategy could handle this dissent

### d_3_2  (none - loop 3)
> operator-session.ts may not handle token expiry or renewal during long-lived console sessions, potentially leaving an authenticated session open indefinitely or causing silent auth failures mid-use

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_2_3  (no_resolver - loop 2)
> The `/mod/invite` route may still leak real names in error responses, stack traces, or server logs even when the guard correctly returns a 401/403 status code, if the route handler partially executes before the guard completes

No resolution strategy could handle this dissent

### d_2_3  (semantic_bridge_weak - loop 2)
> The `/mod/invite` route may still leak real names in error responses, stack traces, or server logs even when the guard correctly returns a 401/403 status code, if the route handler partially executes before the guard completes


`probe: hypothesis_L2_H1`

### d_3_3  (no_resolver - loop 3)
> New operator routes added in the future may not automatically inherit dual-gate protection if there is no centralized route-policy manifest enforcing auth + local-only by default on all /mod/* paths

No resolution strategy could handle this dissent

### d_3_3  (semantic_bridge_weak - loop 3)
> New operator routes added in the future may not automatically inherit dual-gate protection if there is no centralized route-policy manifest enforcing auth + local-only by default on all /mod/* paths


`probe: hypothesis_L3_H5`

---

Gate verified nothing this run: every probe failed with NameError, name 'logger'
is not defined. Confidence was capped at 69% for that reason, not for any finding.
Evidence for this change is the suite, tsc, the agent's live walk-through, the
mutation check, and the direct access checks run by hand.
