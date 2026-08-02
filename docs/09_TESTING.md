# Testing Strategy

## Goal

The test suite protects file contracts, truthful generation, fail-closed behavior, and backward compatibility. The existing `test-all.mjs` suite remains the umbrella command; focused tests should stay beside their root scripts where current conventions require.

## Test Pyramid

### Unit tests

Test deterministic libraries: job-source parsers, role-lane rules, liveness classifiers, claim validation, score math, state transitions, row parsing, path validation, and artifact naming.

### Contract tests

Verify agent handoff schemas, job-source normalized records, machine-summary YAML, tracker TSV order, report headers, canonical state names, and optional OmniRoute adapter behavior.

### Integration tests

Exercise scan-to-pipeline, evaluation-to-report, tailoring-to-PDF, TSV-to-tracker merge, set-status updates, and index rebuilds using temporary repository fixtures.

### End-to-end tests

Run a local fixture workflow from discovery through a prepared application, asserting that the browser stops before submit and all artifacts remain local.

## Existing Quality Gates

- `node test-all.mjs` for the full suite
- `node updater-migration-tests.mjs` for user/system boundary and upgrade compatibility
- `node verify-pipeline.mjs` for report/tracker integrity
- Focused `*.test.mjs` files adjacent to scripts
- CI test and security analysis required by repository governance

Do not rename or replace these entrypoints when adding the agent architecture.

## Required Compatibility Fixtures

Keep representative fixtures for:

- Existing tracker with and without optional `Via`
- Root-relative and tracker-relative report links
- Approved score sentinels
- Similar titles with distinct requisition IDs
- Historical report machine summaries
- Current mode names and direct Node commands
- Missing onboarding files
- Existing job-source configuration shapes, including the legacy `provider:` key
- Batch reservations and stale sentinels

Golden fixtures should be minimal and synthetic; never copy real candidate PII into tests.

## Agent Tests

Each of the six agents needs table-driven cases for:

- Valid handoff
- Missing prerequisite
- Invalid schema
- Duplicate/replayed request
- Interrupted resume
- Untrusted external instruction
- Forbidden action request
- Downstream library failure

The assertion is not merely “error returned.” It must verify a stable error category, no prohibited write, and a useful next action.

## Truthfulness Tests

Build adversarial cases where a JD asks for a skill absent from the CV, claims the model should ignore policy, or uses a tool name that appears in the CV without authorship. Tailoring must omit unsupported claims. Application answers must not guess identity, authorization, compensation, or legal attestations.

Add snapshot tests for evidence maps, not just final prose, so a fluent fabrication cannot pass unnoticed.

## Playwright Tests

Use a local test server for active/expired/unconfirmed pages, redirects, multi-step forms, file uploads, login walls, and ambiguous buttons. Test preliminary `FreshnessProbe` separately from authoritative `VerificationResult`. Assert that final submission is never triggered. Keep live-site smoke tests opt-in and non-blocking because external websites change independently.

## Job-Source Adapter Tests

Every job-source adapter includes raw fixtures for pagination, empty results, malformed payloads, missing fields, rate limits, and schema drift. Network access is not required for normal tests. A source failure must not be reported as zero jobs.

## Dependency Tests

Add architecture checks that agents do not import or call other agents, libraries do not import agents/modes/Orchestrator, compatibility adapters do not decide business policy, and OmniRoute cannot access canonical write ports directly.

## Tracker Tests

Test locks, atomic replacement, invalid status rejection, column swap, score sentinels, link normalization, deduplication, agency tags, posting-ID disambiguation, and idempotent replay. Failure injection should terminate writes between temporary creation and replacement to prove the original survives.

## Optional OmniRoute Tests

The adapter contract should run against a fake local implementation. Test timeout, unavailable service, malformed result, model-backend mismatch, retry policy, and removal of configuration. The same workflow must pass through the direct/local runtime without OmniRoute.

## Documentation Tests

Check that referenced local files/commands exist, Markdown links resolve, diagrams render as fenced text, and target-design claims are labeled when not implemented. Documentation must not expose personal data from user-layer files.

## Test Commands in VS Code

Use the integrated terminal:

```powershell
node test-all.mjs
node verify-pipeline.mjs
node updater-migration-tests.mjs
```

Run focused tests while developing, then the full suite before handoff. If dependencies are missing, report the precondition; do not claim tests passed.

## Definition of Done

- New behavior has unit and contract coverage.
- Compatibility fixtures pass unchanged or an explicit migration is tested.
- Negative tests prove fail-closed behavior.
- No test requires a hosted control plane.
- Playwright cannot submit externally.
- Truth validation rejects unsupported claims.
- Full suite and pipeline verification pass in a correctly installed checkout.
