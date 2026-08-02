# Architecture Documentation Changelog

## 2026-08-02 — Consistency and Decision Alignment

### Scope

This documentation-only change reconciles the findings in `ARCHITECTURE_REVIEW.md` across the numbered target-design suite and affected operator guides. It does not implement agents, services, schemas, adapters, tests, migrations, or OmniRoute integration. Current career-ops modes, scripts, and file formats remain operationally authoritative until planned code work is completed.

## Finding-by-Finding Changes

### AR-01 — Canonical persistence doctrine

**Change:** Declared Markdown/YAML/TSV artifacts permanently canonical. SQLite, run manifests, indexes, and caches are derived, disposable, and rebuildable. Removed the documented possibility of a future database-primary tracker. Replaced generic tracker “hand edits” with guarded writes through `merge-tracker.mjs`, `set-status.mjs`, and explicit repair/migration commands.

**Why:** Dual canonical stores would create divergence, unsafe migrations, and ecosystem incompatibility.

**Updated:** `00_VISION.md`, `01_SYSTEM_DESIGN.md`, `07_TRACKER.md`, `SCRIPTS.md`, `ROADMAP.md`.

### AR-02 — Duplicated agent responsibilities

**Change:** Assigned single ownership at phase boundaries. TailoringAgent owns CV/cover/email/outreach drafts but not ATS form answers. ApplicationAgent owns ATS field answers and browser fill plans. Job-source libraries normalize postings. Liveness, truth, rendering, artifacts, and tracker persistence remain deterministic services. TrackerAgent expresses tracker intent but does not reimplement table writes.

**Why:** One owner prevents drift, repeated side effects, and different behavior across modes and agents.

**Updated:** `01_SYSTEM_DESIGN.md`, `02_AGENT_ARCHITECTURE.md`, `03_DATA_FLOW.md`, `06_PLAYWRIGHT.md`, `07_TRACKER.md`, `08_TRUTH_BANK.md`.

### AR-03 — Missing mode/agent/worker/script mapping

**Change:** Added the mode compatibility map. `scan`/`discover` route to DiscoveryAgent; `oferta`/`triage` to EvaluationAgent; `pdf`/`cover`/`email`/`contacto` to TailoringAgent; `apply` to ApplicationAgent; tracker operations to TrackerAgent or explicit deterministic utilities; `auto-pipeline`/`pipeline`/`batch` are Orchestrator compositions. Other existing modes remain explicit legacy routes and do not create more core agents. Defined a worker as an execution container, not an agent type.

**Why:** The six-agent target must overlay the existing career-ops router rather than create a competing control plane.

**Updated:** `02_AGENT_ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `ROADMAP.md`.

### AR-04 — Missing implementable interfaces

**Change:** Defined the planned shared result statuses (`ok`, `blocked`, `needs_review`, `retryable_failure`), run-envelope metadata, side-effect reporting, and port ownership for intent routing, job sources, lane policy, liveness, truth, artifacts, tracking, approval, and execution.

**Why:** Versioned boundaries are required for retries, idempotency, diagnostics, testing, and optional runtime substitution.

**Updated:** `01_SYSTEM_DESIGN.md`, `02_AGENT_ARCHITECTURE.md`, `04_RUNTIME.md`, `07_TRACKER.md`, `IMPLEMENTATION_PLAN.md`.

### AR-05 — Missing data models

**Change:** Recorded the target domain set: `RunManifest`, `ExternalSourceRef`, `RawPosting`, `NormalizedPosting`, `PostingIdentity`, `LaneDecision`, `FreshnessProbe`, `VerificationResult`, `EvidenceRef`, `Claim`, `EvaluationResult`, `TailoredArtifact`, `ApplicationDraft`, `TrackerCommand`, `TrackerResult`, and `Diagnostic`. Required schema versions, explicit unknowns, provenance, and immutable human-submit protection.

**Why:** Providers, agents, adapters, and file compatibility cannot converge without a shared domain vocabulary and versioning policy.

**Updated:** `01_SYSTEM_DESIGN.md`, `02_AGENT_ARCHITECTURE.md`, `05_PROVIDER_ARCHITECTURE.md`, `07_TRACKER.md`, `08_TRUTH_BANK.md`, `IMPLEMENTATION_PLAN.md`.

### AR-06 — Liveness terminology and authority

**Change:** Split liveness into a cheap discovery `FreshnessProbe` (`active`, `expired`, `unknown`) and authoritative interactive `VerificationResult` (`active`, `expired`, `unconfirmed`). Made rendered Playwright verification authoritative for interactive URL workflows. Clarified that WebFetch extraction is not proof of activity. Documented legacy mappings: `closed` to `expired`, `uncertain` to `unconfirmed`.

**Why:** Discovery optimization and final verification have different evidence strength and must not share ambiguous verdicts.

**Updated:** `03_DATA_FLOW.md`, `06_PLAYWRIGHT.md`, `09_TESTING.md`, `ARCHITECTURE.md`, `SCRIPTS.md`, `RUNNING_ON_A_BUDGET.md`.

### AR-07 — Data-only lane versus generic career-ops

**Change:** Scoped data/analytics/data-platform targeting to this checkout's user-layer `TargetLanePolicy`. Kept the reusable career-ops system role-agnostic. Located configuration in `config/profile.yml`, `modes/_profile.md`, and `portals.yml`, not shared system modes.

**Why:** The user's narrow search goal must be enforced without changing shared defaults or breaking other career-ops installations.

**Updated:** `00_VISION.md`, `01_SYSTEM_DESIGN.md`, `02_AGENT_ARCHITECTURE.md`, `05_PROVIDER_ARCHITECTURE.md`, `ROADMAP.md`, `IMPLEMENTATION_PLAN.md`.

### AR-08 — Missing sequence diagrams

**Change:** Added four message-level Mermaid sequences: single posting evaluation, parallel batch processing, tailoring/application with human submission, and job-source scan/filter/pipeline write.

**Why:** Component diagrams did not show gates, artifacts, partial failures, user approvals, or write order.

**Updated:** `03_DATA_FLOW.md`; planning/test expectations retained in `09_TESTING.md`, `ROADMAP.md`, and `IMPLEMENTATION_PLAN.md`.

### AR-09 — Circular dependency risk

**Change:** Established one-way dependencies: interface to Orchestrator to agent ports to domain libraries/adapters. Only the Orchestrator invokes agents. Agents never invoke agents; libraries never import agents, modes, or the Orchestrator; adapters do not own business policy; run manifests do not define canonical artifact meaning.

**Why:** This prevents orchestration loops, policy duplication, and adapters becoming hidden control planes.

**Updated:** `01_SYSTEM_DESIGN.md`, `02_AGENT_ARCHITECTURE.md`, `09_TESTING.md`, `IMPLEMENTATION_PLAN.md`.

### AR-10 — Scalability gaps

**Change:** Added planned scale controls: derived incremental read models, content fingerprints and schema versions, bounded job-source and model concurrency, separate discovery/evaluation budgets, evidence references with bounded excerpts, deterministic tracker merge checkpoints, provider-health versus empty-result distinction, and resumable batches.

**Why:** File-first does not mean full rescans, unbounded contexts, or unbounded fan-out. Scale should improve through derived layers without changing canonical storage.

**Updated:** `01_SYSTEM_DESIGN.md`, `02_AGENT_ARCHITECTURE.md`, `04_RUNTIME.md`, `05_PROVIDER_ARCHITECTURE.md`, `08_TRUTH_BANK.md`, `ROADMAP.md`, `IMPLEMENTATION_PLAN.md`.

### AR-11 — Overloaded “provider” terminology

**Change:** Adopted **job-source adapter** for ATS/job-board integrations and **model backend** for LLM endpoints/vendors. Preserved the literal `provider:` configuration key and plugin hook as backward-compatible syntax. Renamed the provider architecture document's title and prose without renaming the requested file.

**Why:** One term previously referred to three unrelated extension surfaces, making contracts and diagnostics ambiguous.

**Updated:** `01_SYSTEM_DESIGN.md`, `02_AGENT_ARCHITECTURE.md`, `03_DATA_FLOW.md`, `04_RUNTIME.md`, `05_PROVIDER_ARCHITECTURE.md`, `09_TESTING.md`, `PLUGINS.md`, `SUPPORTED_JOB_BOARDS.md`, `local-parser-cookbook.md`, `ROADMAP.md`, `RUNNING_ON_A_BUDGET.md`.

### AR-12 — Backward-compatibility disagreements

**Change:** Added an explicit tracker compatibility matrix. New scores emit `X.X/5`; numeric legacy precision remains readable. New no-score values are `N/A`, `—`, or `-`; legacy `DUP` is read-only compatibility. Canonical pipeline heading is `## Pending`; localized modes may recognize translated headings. Canonical states remain those in `templates/states.yml`, with localized labels treated as presentation/normalization. Standardized A-G evaluation language and clarified artifact/write paths.

**Why:** “Accept legacy, emit canonical” preserves old files without allowing format drift in new output.

**Updated:** `07_TRACKER.md`, `SCRIPTS.md`, `FREE_TIER.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`.

### AR-13 — Local-first and zero-token claims

**Change:** Defined `local-storage`, `zero-LLM`, `local-model`, and `hosted-model` separately. Corrected prompt-based triage from zero-token to low-token. Clarified that public-API scanning is zero-LLM but uses network access, while hosted model backends may receive selected prompt context. Corrected standard scanner documentation so Playwright is not implied for ordinary API scans.

**Why:** Storage location, network access, model usage, and model-data egress are different properties and must not be conflated.

**Updated:** `00_VISION.md`, `01_SYSTEM_DESIGN.md`, `04_RUNTIME.md`, `AUTOMATION.md`, `RUNNING_ON_A_BUDGET.md`, `FAQ.md`, `CODEX.md`, `FREE_TIER.md`.

### AR-14 — OmniRoute boundary

**Change:** Limited OmniRoute to an optional `ExecutionPort` adapter: `AgentTask` in, `AgentResult` out. It cannot own workflow order, business policy, truth/lane fallbacks, canonical writes, tracker mutation, or development requirements.

**Why:** A broader OmniRoute role would duplicate the Orchestrator and weaken local control.

**Updated:** `00_VISION.md`, `01_SYSTEM_DESIGN.md`, `02_AGENT_ARCHITECTURE.md`, `04_RUNTIME.md`, `05_PROVIDER_ARCHITECTURE.md`, `09_TESTING.md`, `ROADMAP.md`, `IMPLEMENTATION_PLAN.md`.

### AR-15 — Documentation precedence

**Change:** Established normative precedence: `AGENTS.md`/`DATA_CONTRACT.md`; root `ARCHITECTURE.md`; numbered target-design docs; current runtime/operator docs; `SCRIPTS.md` for current command behavior. Marked the review and implementation plan as analysis/planning rather than higher-order policy. Added documentation-resolution status to the review.

**Why:** Multiple architecture layers need a deterministic conflict-resolution rule.

**Updated:** `01_SYSTEM_DESIGN.md`, `ARCHITECTURE_REVIEW.md`, `IMPLEMENTATION_PLAN.md`, `ROADMAP.md`.

## Additional Safety Alignment

### Duplicate applications

**Change:** Removed guidance suggesting email aliases to bypass ATS candidate merging. Apply mode now stops and asks the user to review an already-applied posting.

**Why:** This aligns duplicate prevention with tracker identity, quality-over-quantity, and recruiter-respect rules.

**Updated:** `APPLY_AUTOFILL.md`.

### User-specific negotiation content

**Change:** Moved documented personalization targets from `modes/_shared.md` to `modes/_profile.md` or `config/profile.yml`. Clarified that canonical state changes are shared-system changes.

**Why:** User-specific facts and scripts must survive system updates and comply with the data contract.

**Updated:** `CUSTOMIZATION.md`.

### Development versus runtime interfaces

**Change:** Clarified that VS Code with Codex is the planned architecture's development interface, while existing Cowork and multi-CLI runtime compatibility remains supported.

**Why:** “VS Code only” applies to the development loop, not to removal of established career-ops runtime surfaces.

**Updated:** `00_VISION.md`, `01_SYSTEM_DESIGN.md`, `COWORK.md`, `CODEX.md`, `SUPPORTED_CLIS.md`.

## Files Changed

- `00_VISION.md`
- `01_SYSTEM_DESIGN.md`
- `02_AGENT_ARCHITECTURE.md`
- `03_DATA_FLOW.md`
- `04_RUNTIME.md`
- `05_PROVIDER_ARCHITECTURE.md`
- `06_PLAYWRIGHT.md`
- `07_TRACKER.md`
- `08_TRUTH_BANK.md`
- `09_TESTING.md`
- `ARCHITECTURE.md`
- `ARCHITECTURE_REVIEW.md`
- `IMPLEMENTATION_PLAN.md`
- `ROADMAP.md`
- `APPLY_AUTOFILL.md`
- `AUTOMATION.md`
- `CODEX.md`
- `COWORK.md`
- `CUSTOMIZATION.md`
- `FAQ.md`
- `FREE_TIER.md`
- `local-parser-cookbook.md`
- `PLUGINS.md`
- `RUNNING_ON_A_BUDGET.md`
- `SCRIPTS.md`
- `SUPPORTED_JOB_BOARDS.md`
- `SUPPORTED_CLIS.md`
- `CHANGELOG_ARCHITECTURE.md`

## Implementation Status

Documentation is internally aligned to the decisions above. Code remains unchanged. The dependency-ordered work in `IMPLEMENTATION_PLAN.md` is still pending and must be implemented behind compatibility tests and the existing career-ops data contract.
