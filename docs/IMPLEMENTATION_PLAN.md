# Architecture Implementation Plan

## Purpose

This plan converts every finding in `ARCHITECTURE_REVIEW.md` into dependency-ordered implementation work. It preserves the six-agent decision, existing career-ops workflows, stable root commands, canonical local files, and the human submission boundary.

This document is planning only. It does not indicate that the target components have been implemented.

The documentation-alignment pass completed the decision-recording portions of P0 and the documentation inventory portions of P1/P12. All code, contract implementation, characterization testing, service extraction, agent work, orchestration, scale work, and OmniRoute integration remain pending.

## Severity Classification

### Critical

| ID | Finding | Why critical |
|---|---|---|
| AR-01 | Canonical persistence doctrine is contradictory | Implementation cannot safely begin while Markdown and SQLite can both be interpreted as future canonical stores. This decision affects every write path, migration, index, and recovery procedure. |

### High

| ID | Finding | Why high |
|---|---|---|
| AR-02 | Agent responsibilities overlap | Duplicate ownership would create inconsistent rules and repeated side effects across agents, modes, and libraries. |
| AR-03 | Modes, agents, workers, and scripts are not mapped | The target control plane cannot preserve backward compatibility without an explicit routing map. |
| AR-04 | Interfaces are descriptive rather than implementable | Agent work cannot be composed, retried, or tested reliably without versioned contracts. |
| AR-05 | Core data models are incomplete and unversioned | Every provider, agent, tracker command, and artifact depends on stable domain records. |
| AR-06 | Liveness terminology and authority conflict | A wrong or ambiguous verdict can waste evaluation effort or permit work on an expired posting. |
| AR-07 | The data-only lane conflicts with generic career-ops customization | Hardcoding this checkout's target lane into the system layer would violate backward compatibility and the data contract. |

### Medium

| ID | Finding | Why medium |
|---|---|---|
| AR-08 | Message-level sequence diagrams are missing | The architecture is understandable at component level but does not yet specify gates, retries, and human interactions precisely. |
| AR-09 | The target design permits latent circular dependencies | Cycles are avoidable now but become expensive after agents and adapters depend on one another. |
| AR-10 | File-first scalability limits are not designed through | Current scale is workable, but large trackers, broad scans, and batch context duplication will degrade predictability. |
| AR-11 | “Provider” has three meanings | Ambiguity will leak into APIs, configuration, diagnostics, and OmniRoute integration if not resolved early. |
| AR-12 | Backward-compatibility details disagree | Format and terminology drift can break existing reports, trackers, scripts, and localized views. |
| AR-13 | Local-first and zero-token claims are too broad | Users need accurate data-egress and model-cost expectations, though this does not block the core domain design. |
| AR-14 | OmniRoute's interface is underspecified | Optional integration can wait, but its eventual boundary must not duplicate the Orchestrator or write canonical state. |

### Low

| ID | Finding | Why low |
|---|---|---|
| AR-15 | Documentation ownership and precedence are unclear | This creates drift and review friction but can be resolved without changing runtime behavior. |

## Planning Principles

1. **Decisions before abstractions.** Resolve canonical storage, lane scope, terminology, and compatibility before defining APIs.
2. **Contracts before agents.** Models and ports are implemented and tested before agent coordinators.
3. **Libraries before orchestration.** Deterministic behavior is centralized before agents call it.
4. **Compatibility before migration.** Existing modes and root scripts remain working entrypoints throughout.
5. **One writer per artifact.** Tracker and report side effects retain guarded, idempotent paths.
6. **Local execution first.** The full workflow must work without OmniRoute.
7. **Fail closed.** Missing evidence, ambiguous identity, unsupported schemas, failed verification, and forbidden external actions stop explicitly.

## Dependency Graph

```text
P0 Architecture decisions
  |
  v
P1 Compatibility baseline
  |
  v
P2 Vocabulary and domain models
  |
  v
P3 Versioned ports and result envelope
  |
  v
P4 Shared policy, truth, liveness, artifact, and persistence services
  |
  +---------------------+
  v                     v
P5 TrackerAgent     P6 DiscoveryAgent
  |                     |
  +----------+----------+
             v
P7 EvaluationAgent and TailoringAgent
             |
             v
P8 ApplicationAgent and browser boundary
             |
             v
P9 Orchestrator and compatibility routing
             |
             v
P10 Scale, resilience, and observability
             |
             v
P11 Optional OmniRoute adapter
             |
             v
P12 Documentation alignment and release
```

Sequence diagrams are finalized after contracts and ownership are settled, then used as acceptance specifications for P5–P9.

## Phase P0 — Architecture Decisions

**Findings:** AR-01, AR-07, AR-11, AR-15

**Depends on:** None

### Decisions to record

1. `data/applications.md`, `data/pipeline.md`, reports, and other established files remain permanently canonical.
2. SQLite remains a disposable, rebuildable read model; no opt-in database-primary mode is planned.
3. Supported tracker mutations remain guarded commands and migrations. Direct additions to `data/applications.md` are not an implementation path.
4. Data/analytics/data-platform targeting is this checkout's user-layer `TargetLanePolicy`, not a shared career-ops default.
5. The reusable system remains role-agnostic and backward compatible.
6. Use `JobSourceAdapter` for ATS/job-board integrations and `ModelBackend` for LLM endpoints. Preserve the plugin manifest's legacy `provider` hook name only at its compatibility boundary.
7. Adopt the normative document precedence proposed in AR-15.

### Planned artifacts

- A settled architecture-decision section in the existing architecture documentation
- A terminology glossary incorporated into the numbered architecture suite
- A document-precedence statement linked from architecture and contributor guidance

### Exit gate

- No document or planned interface permits SQLite to become canonical.
- Target-lane configuration is assigned only to user-layer files.
- `Posting` and `EmploymentOffer` are distinct concepts.
- Job sources and model backends no longer share an unqualified interface name.

## Phase P1 — Compatibility Baseline

**Findings:** AR-12, AR-15

**Depends on:** P0

### Work

1. Inventory existing mode names, root commands, file paths, report headers, filename conventions, tracker columns, TSV columns, score formats, status values, pipeline headings, and localized presentation labels.
2. Compare written documentation with actual parsers and validators before choosing canonical output forms.
3. Define “accept legacy, emit canonical” rules for every compatible format.
4. Record current side effects for each entrypoint.
5. Prepare characterization fixtures before changing implementation behavior.

### Required compatibility decisions

- Accepted and emitted score precision
- Supported no-score sentinels and the status of legacy `DUP`
- Canonical pipeline section name plus accepted legacy/localized names
- Canonical English states versus localized dashboard labels
- A-G evaluation naming and legacy A-F references
- Report, PDF, and tracker-addition filename shapes
- Report header and machine-summary requirements
- Tracker-row and report-number identity rules

### Planned verification

- Golden fixtures for historical reports and trackers
- Round-trip tests for clean Markdown ↔ derived SQLite views
- Direct command compatibility tests
- Mode-routing characterization tests
- Updater boundary/migration tests

### Exit gate

- Every existing public entrypoint has a documented compatibility status.
- Every legacy format has an explicit accept/reject/migrate decision.
- New architecture work has a regression baseline.

## Phase P2 — Vocabulary and Domain Models

**Findings:** AR-05, AR-11, AR-12

**Depends on:** P1

### Work

Define versioned, serialization-safe models before defining agent interfaces.

| Model | Required planning decisions |
|---|---|
| `RunManifest` | Run ID, requested mode, phase, policy version, timestamps, checkpoints, artifact refs |
| `ExternalSourceRef` | Source kind, URL/path, trust classification, fetch metadata |
| `RawPosting` | Immutable raw reference, source adapter, retrieval time, checksum |
| `NormalizedPosting` | Required/optional fields, explicit unknowns, normalization version |
| `PostingIdentity` | Provider ID, requisition ID, canonical URL, company-role fallback |
| `LaneDecision` | `accepted`, `rejected`, or `needs_review` plus stable reason codes |
| `FreshnessProbe` | Cheap discovery signal, method, timestamp, evidence |
| `VerificationResult` | Authoritative status, method, evidence, authority, timestamp |
| `EvidenceRef` | Approved path, locator, fingerprint, trust tier |
| `Claim` | Proposed value/text, transformation, evidence refs, validation state |
| `EvaluationResult` | Score dimensions, legitimacy, gaps, recommendation, report ref |
| `TailoredArtifact` | Artifact type, template, claims, source evaluation, path, checksum |
| `ApplicationDraft` | ATS fields, answers, evidence, unresolved fields, submit guard |
| `TrackerCommand` | Operation, selector/identity, expected prior state, idempotency key |
| `TrackerResult` | Previous/new state, paths changed, merge/validation results |
| `Diagnostic` | Code, severity, phase, retryability, safe message, related refs |

### Model rules

- Every model carries `schemaVersion`.
- Unknown external values remain explicit unknowns; they are not inferred.
- External content is marked untrusted at ingestion and retains provenance.
- Evidence references point only to approved truth sources.
- `RunManifest` is derived operational metadata, never required to interpret canonical artifacts.
- `ApplicationDraft.humanSubmitRequired` is immutable and always true.

### Exit gate

- Models cover every field currently passed informally between phases.
- Posting identity supports both modern IDs and legacy company-role fallback.
- Models can represent missing and ambiguous states without invented defaults.
- Old artifacts can be adapted into the new models.

## Phase P3 — Versioned Ports and Result Envelope

**Findings:** AR-04, AR-05, AR-09, AR-14

**Depends on:** P2

### Shared result envelope

Every agent and service boundary returns one of:

- `ok`
- `blocked`
- `needs_review`
- `retryable_failure`

The envelope includes schema version, run ID, phase, diagnostics, artifacts, requested/committed side effects, timing, and retry metadata.

### Ports to define

| Port | Responsibility |
|---|---|
| `IntentRouter` | Map current modes/prompts to orchestration plans |
| `JobSourcePort` | Fetch and page raw postings through job-source adapters |
| `LanePolicyPort` | Return one authoritative target-lane decision |
| `LivenessPort` | Return freshness probes and authoritative verification separately |
| `TruthPort` | Resolve evidence and validate claims |
| `EvaluationPort` | Produce a versioned evaluation result |
| `TailoringPort` | Produce evidence-backed draft artifacts |
| `ApplicationPort` | Produce ATS field plans and enforce submit boundary |
| `TrackerPort` | Execute declarative, idempotent tracker commands |
| `ArtifactPort` | Reserve IDs, validate paths, write/checksum artifacts |
| `ApprovalPort` | Record exactly what the user reviewed and authorized |
| `ExecutionPort` | Run an agent task locally or through an optional adapter |

### Cross-cutting semantics

- Cancellation and timeout behavior
- Retry ceilings and backoff ownership
- Idempotency-key construction and retention
- Expected prior state for writes
- Artifact overwrite/versioning policy
- Rate-limit metadata
- Event time versus retrieval/write time
- Secret and sensitive-field redaction

### Exit gate

- No agent depends on another agent's internal implementation.
- Every side effect is declared before execution and reported afterward.
- Local execution can implement the complete `ExecutionPort` contract.
- OmniRoute-specific fields are absent from domain contracts.

## Phase P4 — Shared Deterministic Services

**Findings:** AR-01, AR-02, AR-04, AR-06, AR-07, AR-09

**Depends on:** P3

### Services

1. **Policy service**
   - Target-lane decisions loaded from user-layer configuration
   - Untrusted-content enforcement
   - Human approval gates
   - Fail-closed decision rules

2. **Truth service**
   - Approved-source loading
   - Evidence resolution and fingerprints
   - Claim validation
   - Contradiction and missing-evidence diagnostics

3. **Liveness service**
   - `FreshnessProbe` from public ATS/provider APIs
   - `VerificationResult` from rendered Playwright for interactive workflows
   - Legacy verdict mapping
   - Batch fallback labeling

4. **Artifact service**
   - Report-number reservation
   - Safe local paths and naming
   - Checksums and manifests
   - Atomic writes and overwrite rules

5. **Tracker persistence service**
   - Adapters around `merge-tracker.mjs`, `set-status.mjs`, and verification
   - Canonical state validation
   - Locks, deduplication, and atomic replacement
   - Derived-index refresh

6. **Job-source normalization service**
   - One `NormalizedPosting` output for core and plugin sources
   - Schema-drift diagnostics
   - Explicit empty-versus-error results

### Dependency rule

Services may depend on domain models and lower-level adapters. They may not import agents, modes, or the Orchestrator.

### Exit gate

- Deterministic rules have exactly one implementation owner.
- Services can be tested without invoking an agent or hosted model.
- Existing root scripts remain callable through compatibility adapters.

## Phase P5 — TrackerAgent

**Findings:** AR-02, AR-03, AR-09, AR-12

**Depends on:** P4

TrackerAgent is implemented first because its side effects are already guarded by mature scripts and clear file contracts.

### Scope

- Translate `add_evaluation`, `transition`, `reconcile`, and `verify` intents into `TrackerCommand` records.
- Call only the tracker persistence port.
- Report prior/new state and affected artifacts.
- Never parse and rewrite the canonical table independently.

### Compatibility

- Preserve TSV additions and merge workflow.
- Preserve `set-status.mjs` selectors and exit semantics.
- Preserve canonical states and link normalization.
- Keep SQLite derived and rebuildable.

### Exit gate

- Replayed commands are idempotent.
- Ambiguous selectors and duplicates fail closed.
- Direct current commands and TrackerAgent produce equivalent valid results.
- No agent-side table-writing logic exists.

## Phase P6 — DiscoveryAgent

**Findings:** AR-02, AR-03, AR-07, AR-10, AR-11

**Depends on:** P4; may proceed in parallel with P5 after shared contracts stabilize

### Scope

- Select configured sources and request provider scans.
- Consume `NormalizedPosting` records.
- Request the user-layer lane decision.
- Apply blacklist, title, location, compensation, work-authorization, and dedup policies through services.
- Produce pipeline-write intents through the artifact/persistence boundary.

### Compatibility

- Preserve `scan.mjs`, `scan-ats-full.mjs`, `scan-interamt.mjs`, local parsers, and plugin hooks.
- Preserve `portals.yml`, scan history, scan-run counters, and pipeline format.
- Keep zero-LLM scans available.

### Scale controls

- Bounded provider concurrency
- Provider-specific pagination/rate budgets
- Checkpoint/resume for large scans
- Stable distinction between empty results and provider failures
- Content hashes for unchanged results

### Exit gate

- Core and plugin postings normalize to the same model.
- Data-lane policy comes from user-layer configuration.
- Existing scan entrypoints still work directly.
- A failed source cannot be reported as “zero jobs.”

## Phase P7 — EvaluationAgent and TailoringAgent

**Findings:** AR-02, AR-03, AR-04, AR-05, AR-06, AR-10, AR-12

**Depends on:** P5 and P6 contracts; P4 truth/liveness/artifact services

### EvaluationAgent scope

- Request authoritative liveness verification.
- Load approved evaluation inputs through explicit references.
- Produce A-G evaluation results and existing compatible reports.
- Keep legitimacy separate from the 1–5 fit score.
- Recommend against applications below 4.0/5 unless the user records an override.

### TailoringAgent scope

- Produce CV, cover-letter, email, and outreach drafts.
- Transform only validated claims.
- Pass rendering requests to deterministic artifact/rendering services.
- Exclude ATS form answers; those belong to ApplicationAgent.

### Context controls

- Pass evidence IDs and bounded excerpts rather than every truth file in full.
- Cache parsed source fingerprints, never factual conclusions detached from sources.
- Version report and claim schemas.

### Exit gate

- Every factual sentence in a tailored artifact resolves to approved evidence.
- Dead postings stop before evaluation; unconfirmed batch results are labeled.
- Existing reports, PDF paths, and direct evaluator commands remain compatible.
- TailoringAgent contains no application-form ownership.

## Phase P8 — ApplicationAgent and Browser Boundary

**Findings:** AR-02, AR-04, AR-06, AR-08, AR-09

**Depends on:** P7 and P4 Playwright/liveness/truth services

### Scope

- Navigate only verified application pages.
- Extract field models through browser helpers.
- Map verified structured profile values and source-grounded answers.
- Present unresolved, sensitive, legal, demographic, salary, sponsorship, consent, authentication, and CAPTCHA fields for human action.
- Optionally fill reversible fields after approval.
- Stop before every final external action.

### Hard boundary

The final submit action is not exposed through the application port. `humanSubmitRequired` cannot be disabled by configuration, model output, plugin data, or OmniRoute.

### Exit gate

- Local fixture tests prove Submit/Send/Apply is never clicked.
- ApplicationAgent is the only agent that owns ATS field answers.
- Browser state and secrets are not written to logs or canonical artifacts.
- Current `apply` and read-only preparation workflows remain available.

## Phase P9 — Orchestrator and Compatibility Routing

**Findings:** AR-02, AR-03, AR-08, AR-09

**Depends on:** P5–P8

The Orchestrator is implemented after specialist ports are stable so it coordinates rather than absorbs their behavior.

### Scope

- Map current modes and natural-language intent through `IntentRouter`.
- Run preflight/onboarding gates.
- Build phase plans and invoke agents; agents never invoke one another.
- Persist derived run checkpoints.
- Coordinate report reservations, batch workers, merges, retries, and resumes.
- Request human approvals at explicit boundaries.
- Summarize artifacts and diagnostics.

### Required routing map

| Existing mode | Target route |
|---|---|
| `scan`, `discover` | DiscoveryAgent |
| `oferta`, `triage` | EvaluationAgent |
| `pdf`, `cover`, `email`, `contacto` | TailoringAgent |
| `apply` | ApplicationAgent |
| `tracker`, selected follow-up/outcome operations | TrackerAgent or explicit deterministic utility |
| `auto-pipeline`, `pipeline`, `batch` | Orchestrator compositions |
| Interview, pattern, upskill, training, and offer-prep modes | Explicit legacy-mode routes until separately designed; no extra core agents |

### Sequence specifications

Finalize and test the four required sequences:

1. Single posting evaluation and tracker registration
2. Parallel batch reservation, partial completion, merge, and resume
3. Tailoring/application with truth and human-submit gates
4. Provider scan, normalization, lane filtering, deduplication, and pipeline write

### Exit gate

- Full workflow runs locally from VS Code/Codex.
- Direct legacy entrypoints remain valid alternatives.
- Interrupted workflows resume without duplicate artifacts or tracker rows.
- Dependency checks show no agent-to-agent calls or library-to-agent imports.

## Phase P10 — Scalability, Resilience, and Observability

**Findings:** AR-10, AR-12, AR-13

**Depends on:** P9

### Workstreams

1. **Incremental read models**
   - Keep SQLite derived.
   - Reindex only changed canonical artifacts using fingerprints/schema versions.

2. **Batch controls**
   - Bounded worker pools
   - Model/backend budgets
   - Deterministic tracker merge checkpoints
   - Partial-failure resume

3. **Discovery scale**
   - Separate ATS breadth from evaluation concurrency.
   - Preserve DNS pacing and provider rate limits.
   - Surface provider health independently of match counts.

4. **Context scale**
   - Use references and bounded excerpts.
   - Avoid copying full mode/profile content into every internal handoff when the runtime can resolve a versioned reference safely.

5. **Observability**
   - Structured local diagnostics by run and phase
   - Redaction of secrets and sensitive fields
   - Metrics for duration, retries, provider results, model use, and artifact writes

6. **Accurate runtime labels**
   - `local-storage`
   - `local-model`
   - `zero-LLM`
   - `hosted-model` with documented candidate-data egress

### Exit gate

- Large scans and batches have explicit resource limits and resume behavior.
- Derived indexes can be deleted and rebuilt without data loss.
- Logs distinguish provider failure, no results, policy rejection, and duplicate suppression.
- User-facing cost/privacy labels match actual runtime behavior.

## Phase P11 — Optional OmniRoute Adapter

**Findings:** AR-04, AR-09, AR-14

**Depends on:** P9 local workflow and P10 execution/observability controls

### Fixed role

OmniRoute implements only `ExecutionPort`:

```text
AgentTask -> OmniRoute adapter -> AgentResult
```

It does not:

- Own workflow order
- Evaluate business policy
- Select truth or lane fallbacks
- Write canonical files
- Mutate the tracker
- Replace the Orchestrator
- Become required for development or testing

### Work

- Define task/result serialization and supported schema versions.
- Define cancellation, timeout, retry, and backend-selection behavior.
- Use a local fake adapter for contract tests.
- Validate canonical artifact references returned from remote execution before local commit.
- Test outage, malformed result, version mismatch, duplicate replay, and configuration removal.

### Exit gate

- The same workflow passes through local and OmniRoute execution ports.
- Removing OmniRoute configuration leaves the system fully usable.
- OmniRoute failure cannot corrupt, strand, or become authoritative over local artifacts.

## Phase P12 — Documentation Alignment and Release

**Findings:** AR-08, AR-11, AR-12, AR-13, AR-15

**Depends on:** P0–P11 behavior finalized

### Work

- Update existing docs without creating a competing documentation hierarchy.
- Make root architecture doctrine and data contract authoritative.
- Mark target-design sections implemented, deferred, or compatibility-only.
- Reconcile A-G naming, score formats, status labels, pipeline headings, filenames, customization paths, liveness terms, and scanner/Playwright descriptions.
- Publish all four sequence diagrams.
- Add runtime privacy/egress and zero-LLM terminology.
- Generate provider capability references from the provider registry where practical.
- Link operator guides to canonical contracts rather than duplicating volatile details.

### Release gate

- Documentation link and command checks pass.
- Full test suite, migration tests, pipeline verification, and security checks pass.
- Upgrade and rollback preserve all user-layer files.
- Compatibility matrix covers legacy and new routes.
- No document implies autonomous submission, fabricated facts, a canonical database, or mandatory OmniRoute.

## Finding-to-Phase Traceability

| Finding | Primary phase | Supporting phases | Completion evidence |
|---|---|---|---|
| AR-01 | P0 | P4, P5, P12 | Permanent file-canonical decision and derived-index tests |
| AR-02 | P4 | P5–P9 | Single-owner matrix and dependency checks |
| AR-03 | P9 | P1, P5–P8 | Mode-to-agent routing matrix and compatibility tests |
| AR-04 | P3 | P4, P11 | Versioned ports and common result envelope |
| AR-05 | P2 | P3 | Complete versioned domain model set |
| AR-06 | P4 | P7, P8 | Separate probe/verification models and one verdict vocabulary |
| AR-07 | P0 | P4, P6 | User-layer `TargetLanePolicy`; generic system unchanged |
| AR-08 | P9 | P3, P8, P12 | Four accepted message-level sequence diagrams |
| AR-09 | P3 | P4, P9, P11 | Enforced one-way dependency graph |
| AR-10 | P10 | P6, P7 | Scale budgets, incremental reads, bounded context/concurrency |
| AR-11 | P0 | P2, P6, P12 | `JobSourceAdapter`/`ModelBackend` vocabulary |
| AR-12 | P1 | P5–P7, P12 | Compatibility appendix, fixtures, and migration rules |
| AR-13 | P10 | P12 | Runtime egress matrix and accurate cost labels |
| AR-14 | P11 | P3, P9 | Optional execution-only OmniRoute adapter |
| AR-15 | P0 | P1, P12 | Normative documentation precedence and ownership |

## Implementation Order for the Six Agents

The six-agent list includes the Orchestrator. Recommended delivery order is:

1. **TrackerAgent** — smallest policy surface and strongest existing guarded write paths.
2. **DiscoveryAgent** — deterministic providers and clear pipeline output.
3. **EvaluationAgent** — depends on normalized postings, truth, liveness, and artifacts.
4. **TailoringAgent** — depends on validated evaluation and claim models.
5. **ApplicationAgent** — depends on tailored artifacts, browser contracts, and approval gates.
6. **Orchestrator** — depends on all specialist ports and owns the final workflow state machine.

This order minimizes temporary duplication and prevents the Orchestrator from becoming a monolith while specialist interfaces are still changing.

## Global Definition of Done

Implementation is complete only when:

- All 15 findings have traceable closure evidence.
- Existing modes, root commands, and canonical artifacts remain usable.
- Markdown/YAML/TSV files remain canonical; databases and run manifests are derived.
- The data-only lane is enforced through this user's layer without narrowing shared defaults.
- The six agents have non-overlapping responsibilities.
- Agents communicate only through versioned ports and do not call each other.
- Every generated factual claim resolves to approved evidence.
- Liveness and posting identity failures stop safely.
- Tracker writes remain locked, validated, atomic, and idempotent.
- Application automation cannot submit externally.
- The complete workflow runs locally in VS Code with Codex and without OmniRoute.
- OmniRoute, when enabled, is an optional execution adapter only.
- Compatibility, migration, failure-injection, security, and full-suite tests pass.
