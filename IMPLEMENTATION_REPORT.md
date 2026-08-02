# Spec 001 Discovery Implementation Report

## Scope

Implemented only `specs/001-discovery.md`. Specs 002 through 006 were not implemented. Existing architecture documentation and specifications were not changed.

## Changes

- Added a versioned Discovery task/result contract with runtime validation, stable idempotency keys, structured diagnostics, secret redaction, and fail-closed statuses.
- Added the `NormalizedPosting` model with explicit unknown values, deterministic posting identity, raw-content checksums, provenance, injection-anomaly reporting, and non-authoritative freshness hints.
- Added a `JobSourcePort` adapter boundary supporting source detection, configuration validation, bounded fetches, normalization, and health reporting.
- Added deterministic Discovery policy evaluation for target lane, blacklist, location, salary, content, country/visa, and deduplication gates. Existing scanner filter helpers are reused instead of reimplemented.
- Added `DiscoveryAgent` orchestration with bounded source concurrency, deterministic merge order, retry/time/item budgets, checkpoint/resume support, per-source diagnostics, and requested-versus-committed side-effect reporting.
- Added a default persistence adapter that uses the repository's existing locked pipeline and scanner writers for `data/pipeline.md`, `data/scan-history.tsv`, portal health, and scan-run counters.
- Extended existing scanner helpers with optional path parameters. Their current defaults, exports, and CLI behavior remain unchanged.

## Public Interface

The new entry point is `discover(task)` from `discovery-agent.mjs`, where `task` is an `AgentTask<DiscoveryRequest>`. `createDiscoveryAgent(options)` supports injected adapters and persistence for tests and future orchestration without changing the legacy scanner entry points.

## Compatibility and Safety

- Existing `scan.mjs` commands and default paths remain compatible.
- Both legacy `provider:` and the new `jobSourceAdapter:` source keys are accepted. Conflicting or ambiguous adapter selection returns `needs_review` instead of guessing.
- Discovery does not score jobs, tailor documents, update the application tracker, or claim authoritative Playwright liveness.
- Missing target-lane configuration, unsafe URLs, malformed source output, and policy ambiguity fail closed.
- External posting text remains data; suspicious instruction-like content is surfaced as an anomaly and is never executed.
- No dependencies or lockfiles were added. Local dependencies were installed only to run the repository test harness.

## Tests Added

- Contract validation, deterministic hashing, result-envelope behavior, redaction, normalization, adapter selection, bounded fetch behavior, and policy gates.
- End-to-end Discovery orchestration for deterministic ordering, partial-source failure, empty results, dry runs, checkpoint/resume, persistence accounting, and configuration ambiguity.

## Verification

- `node test-all.mjs --only discovery`: 52 passed, 0 failed, 0 warnings.
- `node test-all.mjs --only scan-`: 50 passed, 0 failed, 0 warnings.
- `node verify-pipeline.mjs`: passed.
- `git diff --check`: passed; Git reported only expected LF-to-CRLF working-tree notices.
- `node test-all.mjs --quick`: 2,816 passed, 1 failed, 3 warnings. The single failure is unrelated to Discovery: the existing `analyze() appDateSource` end-to-end check could not create a Windows temporary-directory symlink to `node_modules` (`EPERM`). Discovery and scanner compatibility tests passed within the same run.

## Commits

- `622dcd4` — `feat(discovery): add spec 001 contracts and services`
- `48d5109` — `feat(discovery): add agent orchestration and persistence`

## Explicitly Deferred

- Evaluation, tracker, tailoring, Playwright, and runtime work from Specs 002–006.
- Orchestrator routing changes.
- Authoritative browser liveness checks.
- Application tracker writes and any application submission behavior.
