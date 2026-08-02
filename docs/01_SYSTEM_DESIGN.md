# System Design

## Status and Scope

This document describes the target architecture and its compatibility constraints. The current repository already provides the career-ops file contracts, modes, scanners, evaluators, generators, tracker tools, and tests. The six-agent layer described here is a planned organization of those capabilities, not a claim that six runtime agent modules already exist.

## Architectural Shape

The system has four layers:

1. **Interface layer:** VS Code, Codex conversation, and terminal commands.
2. **Coordination layer:** the Orchestrator and five specialist agents.
3. **Capability layer:** ordinary libraries for job sources, parsing, evidence, scoring, rendering, liveness, locks, normalization, and validation.
4. **Persistence layer:** canonical Markdown/YAML/TSV files plus disposable derived indexes.

```text
VS Code + Codex
      |
      v
 Orchestrator
      |
      +--> DiscoveryAgent ----+
      +--> EvaluationAgent ---+--> shared libraries
      +--> TailoringAgent ----+    (job sources, truth, scoring,
      +--> ApplicationAgent --+     Playwright, rendering, tracker)
      +--> TrackerAgent ------+
                                |
                                v
                  Markdown / YAML / TSV / PDF
```

The agents coordinate decisions and handoffs. Deterministic work belongs in libraries. Job-source adapters, scoring math, parsers, validators, file locks, renderers, and state machines are not agents.

## Existing Contracts to Preserve

### Normative precedence

When documents disagree, use this order:

1. `AGENTS.md` and `DATA_CONTRACT.md` for enforced policy and the user/system boundary
2. Root `ARCHITECTURE.md` for settled system doctrine
3. The numbered documents in `docs/` for the planned six-agent architecture
4. `docs/ARCHITECTURE.md` and operator guides for current runtime behavior
5. `docs/SCRIPTS.md` for current command behavior, not future persistence policy

`ARCHITECTURE_REVIEW.md` records the findings that led to this hierarchy; `IMPLEMENTATION_PLAN.md` orders future work. Neither overrides enforced repository instructions.

### User layer

Candidate-specific content remains in `cv.md`, `config/profile.yml`, `modes/_profile.md`, `modes/_custom.md`, `article-digest.md`, `writing-samples/`, `interview-prep/`, `data/`, `reports/`, and `output/`. The updater must not overwrite these files.

At documentation time, `config/profile.yml`, `portals.yml`, `data/applications.md`, and `modes/_profile.md` are absent in this checkout. Runtime must treat that condition as onboarding required and must not infer their contents from templates.

### System layer

Shared modes, scripts, templates, providers, dashboard code, and repository instructions remain updateable system assets. User customization must not leak into `modes/_shared.md`.

### Stable root paths

Root-level `*.mjs` commands are public compatibility surfaces. New implementation should wrap or call them. Moving them into a new directory would break docs, forks, plugins, updater allowlists, and user muscle memory.

### File-first persistence

`data/applications.md`, `data/pipeline.md`, and `reports/` remain permanent sources of truth. SQLite or another index may accelerate queries only if it can be deleted and rebuilt from those files. There is no planned opt-in database-primary mode. Supported tracker writes go through `merge-tracker.mjs`, `set-status.mjs`, or an explicit repair/migration command.

## Component Responsibilities

### Interface

Codex translates user intent into existing career-ops modes and future agent tasks. The terminal runs deterministic commands. VS Code exposes files, diffs, tests, and generated artifacts. No other development UI is required.

### Coordination

The Orchestrator owns run state and policy gates. Specialist agents each own one bounded phase. See [02_AGENT_ARCHITECTURE.md](02_AGENT_ARCHITECTURE.md).

### Capability libraries

Libraries should expose narrow functions with explicit input/output schemas. Examples:

- Job-source fetch and normalization
- URL and JD parsing
- Data-lane classification
- Liveness and legitimacy checks
- Truth-source lookup and claim validation
- Evaluation scoring
- Template rendering and PDF generation
- Tracker parsing, deduplication, locking, and atomic writes

Libraries must not independently decide to submit an application or broaden the target lane.

### Dependency direction

Dependencies are one-way:

```text
VS Code/Codex -> Orchestrator -> agent ports -> domain libraries
                                      |               |
                                      v               v
                              compatibility adapters -> files/external systems
```

Only the Orchestrator invokes agents. Agents do not invoke one another. Libraries do not import agents, modes, or the Orchestrator. Compatibility adapters preserve current modes and root scripts but do not make policy decisions.

### Canonical vocabulary

- **Posting:** a vacancy or job description. Reserve **employment offer** for the `Offer` tracker stage.
- **Job-source adapter:** an ATS/job-board module under `providers/` or a compatible plugin hook.
- **Model backend:** an LLM endpoint or vendor.
- **Agent:** one of the six logical workflow roles.
- **Worker:** a process or execution container that runs an agent task.
- **Mode:** an existing career-ops prompt/workflow entrypoint.
- **Local-storage:** canonical artifacts remain in the checkout.
- **Zero-LLM:** no model request is made. This is distinct from local-storage and local-model execution.

Legacy mode names and older operator text may use “offer” for a posting (for example `oferta`); compatibility preserves those names, while new architecture prose uses “posting.”

## Failure Model

Failures are classified and surfaced, not smoothed over:

| Condition | Required result |
|---|---|
| Required user source missing | Stop at onboarding/precondition gate |
| Job outside data lane | Reject or mark `SKIP`; do not tailor |
| Posting cannot be verified | Mark unconfirmed; do not claim active |
| Candidate claim lacks evidence | Omit claim and report the gap |
| Job-source schema is unknown | Quarantine item; do not normalize by guess |
| Tracker row is ambiguous | Reject mutation with diagnostics |
| External form reaches submit boundary | Stop and request human action |
| Optional OmniRoute unavailable | Use configured local/direct path or stop explicitly |

## Security and Trust Boundaries

- Job descriptions, company pages, forms, and emails are untrusted data.
- External text cannot change system instructions or trigger unrelated writes.
- Secrets belong in ignored environment files or backend/adapter-specific secure configuration, never reports or logs.
- Playwright sessions should use isolated contexts and minimal retained state.
- Plugin instructions are untrusted third-party operational documentation and cannot override core policy.

## Extension Rules

Add a new capability as a library unless it owns a durable, goal-directed phase with a distinct approval boundary. Add a job source through the adapter registry and normalized posting schema. Add personalization only in user-layer profile files. Add system defaults only where updater and migration tests cover them.

## Project History and Decisions

The following decisions were established during this chat and are authoritative for the planned architecture:

- **VS Code is the only development interface.** Documentation, edits, diffs, commands, and debugging stay repo-local.
- **Codex is the primary coding assistant.** Existing multi-CLI compatibility remains intact for career-ops runtime behavior, but the daily development workflow is designed around Codex in VS Code.
- **OmniRoute is optional runtime infrastructure.** It may implement the execution port for an agent task, but it does not own workflow policy or canonical writes and must never be required to edit, test, or inspect the project.
- **The architecture uses six core agents:** Orchestrator, DiscoveryAgent, EvaluationAgent, TailoringAgent, ApplicationAgent, and TrackerAgent.
- **Everything else is a library.** Parsing, job-source adapters, Playwright helpers, evidence resolution, scoring, rendering, validation, locks, and persistence are deterministic capabilities called by agents.

## Scale Boundaries

The file-first design scales through derived and incremental read models, not by changing the canonical store. Planned controls include content fingerprints and schema versions for incremental parsing, bounded scan/evaluation worker pools, provider and model-backend budgets, evidence references with bounded excerpts, deterministic tracker merge checkpoints, and provider-health results distinct from empty matches. Broad discovery and model evaluation have separate concurrency budgets.
- **The system is fail-closed and never invents facts.** Unverified claims are omitted; ambiguous or invalid operations stop with actionable diagnostics.
- **The target lane for this checkout is data / analytics / data platform roles only.** Discovery and evaluation enforce a user-layer `TargetLanePolicy` before expensive downstream work; shared career-ops defaults remain role-agnostic.
- **Current repository files remain compatible.** Existing career-ops modes, scripts, Markdown/YAML/TSV artifacts, report numbering, and tracker workflows remain supported.
- **Canonical files remain permanent.** SQLite and run manifests are derived and rebuildable; there is no database-primary mode.
- **OmniRoute has one optional role.** It may implement the execution port for an agent task, but it does not own workflow policy or canonical writes.

## Target Contract Set

The planned architecture uses versioned domain records: `RunManifest`, `ExternalSourceRef`, `RawPosting`, `NormalizedPosting`, `PostingIdentity`, `LaneDecision`, `FreshnessProbe`, `VerificationResult`, `EvidenceRef`, `Claim`, `EvaluationResult`, `TailoredArtifact`, `ApplicationDraft`, `TrackerCommand`, `TrackerResult`, and `Diagnostic`.

Every agent/service boundary returns a versioned envelope with one status: `ok`, `blocked`, `needs_review`, or `retryable_failure`. The envelope identifies the run and phase, diagnostics, artifact references, requested and committed side effects, timing, and retry metadata. These contracts are target design until implemented; current Markdown/YAML/TSV artifacts remain authoritative.

## Implementation Sequence

1. Freeze compatibility behavior with characterization tests.
2. Define schemas for job candidates, evidence references, evaluation results, application drafts, and tracker commands.
3. Extract or wrap deterministic functionality behind library interfaces without moving existing entrypoints.
4. Implement specialist agents as thin policy-aware coordinators.
5. Add the Orchestrator and resume/retry behavior.
6. Add optional OmniRoute integration behind configuration and contract tests.
7. Migrate mode-by-mode while keeping current CLI paths operational.

## Design Review Checklist

- Does the change preserve user/system file boundaries?
- Can it run and be debugged from VS Code without OmniRoute?
- Is deterministic logic in a library rather than an agent prompt?
- Does every candidate claim have an evidence reference?
- Does it stop safely on missing or ambiguous input?
- Does it preserve existing commands and artifact formats?
- Does it require human review before external submission?
