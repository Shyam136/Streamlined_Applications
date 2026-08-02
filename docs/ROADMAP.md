# Roadmap

## Strategy

Evolve the existing career-ops repository incrementally into the six-agent architecture while keeping all current modes, root commands, user files, and tracker artifacts compatible. Each phase is independently useful and reversible. OmniRoute remains optional throughout.

## Current Baseline

The repository already has:

- Markdown mode routing and multi-CLI compatibility
- Public job-source scanning and pipeline files
- A-G posting evaluation rules
- CV, cover-letter, and PDF generation
- Playwright-based verification/application assistance
- Canonical Markdown tracking with guarded scripts
- Batch reservation/merge mechanisms
- A broad test and migration suite

This documentation suite is design work only. No agent implementation or code reorganization is included.

The documentation alignment pass has settled the architectural vocabulary, permanent file-canonical doctrine, user-layer scope of the data-role lane, agent ownership map, planned contract set, liveness hierarchy, dependency direction, and OmniRoute boundary. These are documented decisions only; implementation phases below remain pending.

The current checkout is not onboarded: `config/profile.yml`, `portals.yml`, `data/applications.md`, and `modes/_profile.md` are absent, and dependencies must be installed before `doctor.mjs` can run.

## Phase 0: Restore and Freeze the Baseline

### Deliverables

- Install dependencies and run doctor/full tests.
- Complete user onboarding separately, with real user input.
- Add characterization fixtures for current modes, tracker formats, reports, and job-source outputs.
- Confirm the documented stable commands and file paths as compatibility contracts against implementation behavior.

### Exit criteria

- `doctor.mjs` runs successfully.
- Full suite results are known.
- Missing user files are created only through onboarding.
- No target-architecture code has changed behavior yet.

## Phase 1: Contracts and Policy Libraries

### Deliverables

- Define run envelope and agent result schemas.
- Add stable error categories.
- Implement/centralize a user-layer `TargetLanePolicy`; configure this checkout for data, analytics, and data-platform roles without narrowing shared defaults.
- Implement evidence/claim validation around existing truth sources.
- Add policy tests for untrusted content and human submission boundaries.

### Compatibility approach

Wrap existing mode outputs and scripts. Do not move root files or change current artifact formats.

### Exit criteria

- Existing commands pass unchanged.
- Unsupported candidate claims fail validation.
- Out-of-lane roles stop before tailoring.

## Phase 2: TrackerAgent and DiscoveryAgent

### Deliverables

- Add thin TrackerAgent commands over `merge-tracker.mjs`, `set-status.mjs`, and verification tools.
- Add DiscoveryAgent over `scan.mjs` and `providers/`.
- Introduce normalized posting contracts and job-source diagnostics.
- Preserve pipeline and scan-history formats.

### Exit criteria

- Replay does not create duplicate rows.
- Job-source errors are distinguishable from empty results.
- Existing direct scan/tracker commands still work.

## Phase 3: EvaluationAgent and TailoringAgent

### Deliverables

- Wrap current A-G evaluation modes with evidence-aware inputs/outputs.
- Add machine validation for report headers and summaries.
- Add claim maps to the draft-generation pipeline.
- Keep current HTML, LaTeX, and report outputs compatible.

### Exit criteria

- Every generated factual claim has approved evidence.
- Batch reservations and tracker additions remain race-safe.
- Historical reports remain readable.

## Phase 4: ApplicationAgent and Browser Safety

### Deliverables

- Consolidate Playwright navigation, field extraction, and form mapping helpers.
- Add a hard final-submit guard.
- Add local fixture sites for browser tests.
- Record application drafts and unresolved fields without claiming submission.

### Exit criteria

- End-to-end tests prove final actions are never clicked.
- Authentication, CAPTCHA, consent, and legal fields hand control to the user.
- PDF generation remains deterministic.

## Phase 5: Orchestrator

### Deliverables

- Route compatible modes to the five specialist agents.
- Add checkpoints, idempotent resume, and explicit review gates.
- Coordinate report reservations and post-batch merges.
- Surface one concise local run summary with artifact links.

### Exit criteria

- A complete local workflow runs from VS Code/Codex.
- Interrupted workflows resume without duplicate artifacts.
- Existing mode invocations remain valid alternatives.

## Phase 6: Optional OmniRoute Adapter

### Deliverables

- Implement OmniRoute only as an `ExecutionPort` run-envelope adapter behind a default-off configuration flag.
- Add local fake-adapter contract tests.
- Document model-backend selection, timeouts, and explicit fallback behavior.
- Keep orchestration policy, approval checks, and canonical writes outside the adapter and inside the local runtime.
- Ensure all canonical artifacts are still written locally through the same guarded persistence paths.

### Exit criteria

- Removing OmniRoute configuration leaves the project fully usable.
- OmniRoute outage cannot corrupt or strand canonical data.
- Daily VS Code development has no OmniRoute dependency.

## Phase 7: Hardening and Release

### Deliverables

- Failure-injection testing for job sources, locks, browser sessions, and interrupted runs.
- Performance budgets for large scans and tracker histories.
- Security review of external content, plugins, paths, and secrets.
- Migration notes and rollback instructions.
- Documentation cross-link and command verification.

### Exit criteria

- Full suite, migration tests, CodeQL, and pipeline verification pass.
- A compatibility matrix covers old and new entrypoints.
- Upgrade and rollback preserve the complete user layer.

## Prioritization Rules

1. Truth and safety before convenience.
2. Compatibility before cleanup.
3. Deterministic libraries before additional agent behavior.
4. Local/direct runtime before optional infrastructure.
5. Data-lane quality before source volume.
6. Observable failure before automatic fallback.

## Deferred Ideas

- Any hosted canonical database
- Autonomous submission or messaging
- Broadening beyond data/analytics/data-platform roles
- Moving the flat root for cosmetic organization
- A development UI outside VS Code
- Mandatory OmniRoute deployment

These require an explicit architecture decision and are not implied by the roadmap.
