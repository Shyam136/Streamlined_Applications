# Specification 003: Tracker

## Purpose

Define TrackerAgent and the single guarded mutation boundary for the canonical application tracker. Markdown remains authoritative; SQLite, manifests, and caches remain disposable read models.

## Responsibilities

TrackerAgent must:

- Translate supported intents into versioned `TrackerCommand` records.
- Add evaluations only through one TSV addition per evaluation followed by `merge-tracker.mjs`.
- Update existing rows only through the locked `set-status.mjs` path.
- Request state validation, identity resolution, deduplication, link normalization, locking, atomic replacement, reconciliation, and verification from tracker services.
- Return previous/new state, changed artifacts, and exact validation outcomes.
- Make replay and interrupted recovery idempotent.

TrackerAgent must not parse and rewrite `data/applications.md` independently, create a second canonical store, delete unexplained rows, or infer a status transition from ambiguous input.

## Public Interface

### Agent operation

```text
track(AgentTask<TrackerCommand>) -> AgentResult<TrackerResult>
```

### TrackerCommand

Common fields: `schemaVersion`, `commandId`, `runId`, `idempotencyKey`, `operation`, `expectedPriorState`, `requestedSideEffects`, and `actorApprovalRef` when required.

Supported operations:

```text
add_evaluation(payload: EvaluationRowInput)
transition(selector: TrackerSelector, targetState: CanonicalState, note?: string)
reconcile(scope: ReconcileScope)
verify(scope: VerifyScope)
```

`TrackerSelector` supports report number, posting identity, or company only when unambiguous. Company-role fallback is compatibility behavior; recognizable requisition IDs disambiguate sibling roles.

### TrackerPort

```text
execute(TrackerCommand) -> PortResult<TrackerResult>
```

The port adapts existing guarded scripts rather than introducing an independent writer.

### TrackerResult

Contains command and idempotency identity, resolved selector, previous state, new state, changed paths, merge status, validation/reconciliation results, derived-index refresh status, diagnostics, and committed side effects.

## Inputs

- Shared `AgentTask` envelope and one valid `TrackerCommand`.
- Canonical `data/applications.md` and `templates/states.yml`.
- Validated evaluation report plus nine-column TSV payload for `add_evaluation`.
- Existing report links, requisition/posting IDs, optional tagged `via=` field, and canonical/legacy compatible tracker content.
- Expected prior state for mutations where race detection matters.

New TSV output order is `num, date, company, role, status, score, pdf, report, notes`. New score output is `X.X/5`; approved no-score values are `N/A`, `—`, or `-`.

## Outputs

- One compatible TSV addition and merged tracker row for a successful `add_evaluation`.
- One atomic existing-row update for a successful `transition`.
- Read-only reconciliation or verification diagnostics.
- A `TrackerResult` proving what changed and whether derived indexes refreshed.
- Canonical files that remain independently readable without run metadata or SQLite.

## Dependencies

- Shared contracts from [006-runtime.md](006-runtime.md).
- Existing `merge-tracker.mjs`, `set-status.mjs`, tracker parser, lock, state validator, link normalizer, deduplication, and `verify-pipeline.mjs` behavior.
- Artifact/report identity service and atomic filesystem adapter.
- `EvaluationResult` from [002-evaluation.md](002-evaluation.md) for `add_evaluation` payload creation.
- Optional derived-index builder; failure to refresh it cannot invalidate a committed canonical write.

TrackerAgent calls only `TrackerPort`. Tracker services may depend on models and low-level adapters but never on agents, modes, or the Orchestrator.

## Error Handling

| Condition | Result |
|---|---|
| Missing tracker during an initialized workflow | `blocked` / `TRACKER_MISSING`; use onboarding/setup, do not invent history |
| Invalid canonical state | `blocked` / `TRACKER_STATE_INVALID` |
| Ambiguous selector | `needs_review` / `TRACKER_SELECTOR_AMBIGUOUS` |
| Company-role/posting duplicate | `blocked` / `TRACKER_DUPLICATE` |
| Expected state differs | `blocked` / `TRACKER_CONFLICT` |
| Report number/link mismatch | `blocked` / `TRACKER_REPORT_MISMATCH` |
| Lock contention | Bounded wait, then `retryable_failure` |
| Malformed TSV or ambiguous extra fields | `blocked`; preserve rejected input for diagnosis |
| Crash before atomic replace | Original canonical file remains intact; retry is safe |
| Derived index refresh fails after commit | Canonical result remains valid; diagnostic requires rebuild |
| Duplicate command replay | Return prior result or no-op without duplicate row/note |

Repairs use explicit supported migration commands. They never silently discard data.

## Acceptance Criteria

- `data/applications.md` remains the only canonical tracker representation.
- New rows use TSV plus merge; existing rows use `set-status.mjs`.
- Commands are locked, validated, atomic, and idempotent.
- Ambiguous selectors, invalid states, report mismatches, and duplicates fail closed.
- TSV/Markdown column order and report-link normalization match existing behavior.
- New writers emit `X.X/5` and approved no-score sentinels; legacy numeric precision and `DUP` remain read-only compatibility.
- Optional `Via` and tagged `via=` input remain compatible.
- Similar postings with different recognizable requisition IDs remain distinct.
- Direct current commands and TrackerAgent produce equivalent valid outcomes.
- Deleting the derived index never loses or changes application history.

## Unit Tests

- `TrackerCommand` schema and operation-specific validation.
- Canonical state and expected-prior-state validation.
- TSV parsing, status/score column swap, and score sentinel compatibility.
- Root-relative to tracker-relative report link normalization.
- Posting identity, fuzzy company-role fallback, and requisition-ID disambiguation.
- `via=` parsing and rejection of ambiguous extras.
- Idempotency-key stability and duplicate replay.
- Selector ambiguity and report-link mismatch diagnostics.
- Atomic write sequencing and lock timeout classification.
- Derived-index rebuild from canonical Markdown.

## Integration Tests

- Add a validated evaluation through TSV and merge, then run pipeline verification.
- Repeat the same add command and assert exactly one row.
- Transition a row through `set-status.mjs` and compare the resulting state with the agent route.
- Attempt concurrent transitions with conflicting expected states; exactly one succeeds.
- Inject failure between temporary write and replacement; verify the original tracker is unchanged.
- Merge fixtures with optional `Via`, historical score formats, and distinct same-title requisitions.
- Reject malformed rows while preserving their diagnostic inputs.
- Delete and rebuild the SQLite read model and compare it with canonical Markdown.
- Run reconcile across report, pipeline, and tracker fixtures without modifying healthy artifacts.
