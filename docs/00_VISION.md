# Career-Ops Target Vision

## Purpose

This repository is a local-first job-search operating system for finding, evaluating, tailoring, and tracking high-quality opportunities. For this checkout, the user-layer target lane is deliberately narrow: **data, analytics, and data-platform roles only**. The reusable career-ops system remains role-agnostic; this lane belongs in `config/profile.yml`, `modes/_profile.md`, and `portals.yml`, never in shared system defaults. The system should reduce search noise, preserve the candidate's factual integrity, and keep every consequential action under human control.

The project retains the career-ops workflow and file contracts already present in the repository. The proposed six-agent architecture organizes that workflow; it does not replace the existing modes, scripts, reports, or tracker.

## Product Promise

Given a job source or job description, the system should help the user:

1. Discover relevant data-lane openings.
2. Verify that a posting is live and legitimate.
3. Evaluate fit against verified candidate evidence.
4. Tailor truthful application materials.
5. Prepare an application for human review.
6. Track the application and subsequent outcomes.

The system never submits an application, sends a message, or invents a qualification. It may prepare and recommend; the user decides and acts.

## Operating Model

- **Development interface:** VS Code is the only supported development interface for this project.
- **Primary coding assistant:** Codex is the default collaborator inside the repository.
- **Runtime:** Node.js scripts, Markdown modes, YAML configuration, Playwright, and the existing optional dashboard.
- **Optional infrastructure:** OmniRoute may implement the `ExecutionPort` for an agent task when explicitly enabled, but it does not own workflow policy or canonical writes and is not required for editing, testing, or the normal VS Code development loop.
- **Persistence:** Human-readable repository files remain permanently canonical. Derived indexes, run manifests, and caches are disposable and rebuildable.

## Non-Negotiable Principles

### Local and inspectable

Canonical inputs, reports, generated artifacts, and tracker state stay in the repository. A user must be able to inspect changes with VS Code and Git without querying a hosted service. Hosted model backends may receive prompt context according to their own runtime configuration; “local-first” describes storage and control, not a guarantee of zero network egress. A fully local model is a separate deployment choice.

### Fail closed

Missing evidence, ambiguous state, failed verification, unsupported job-source data, and invalid tracker rows stop or downgrade the operation. They must not be silently guessed into success.

### Truth before optimization

Keywords may be reordered or reformulated, never fabricated. Candidate facts come only from the approved truth sources described in [08_TRUTH_BANK.md](08_TRUTH_BANK.md).

### Quality over volume

The pipeline filters for genuine fit. Scores below 4.0/5 should produce a recommendation not to apply unless the user explicitly overrides with a reason.

### Human approval at the boundary

Automation may navigate, extract, draft, and fill. It must stop before Submit, Send, Apply, or any equivalent irreversible external action.

### Backward compatibility

Existing career-ops entrypoints, root script paths, mode names, report formats, and user-layer files remain valid. New orchestration should call those contracts rather than fork them.

## Target Role Lane

Discovery and evaluation should accept only roles primarily concerned with one or more of:

- Data engineering and data platform engineering
- Analytics engineering and business intelligence engineering
- Data architecture, governance, quality, observability, or reliability
- Data infrastructure, warehousing, lakehouse, streaming, or orchestration
- Data-focused technical leadership where the core mandate remains data/platform delivery

Generic software, product, sales, marketing, and unrelated AI roles should fail this checkout's lane gate unless the user deliberately changes the user-layer profile in a future customization request. That decision does not narrow upstream career-ops defaults for other users.

## Success Measures

- Every generated claim links back to an approved source.
- Every evaluated posting has a liveness result and legitimacy assessment.
- Every tracker mutation passes canonical-state and deduplication checks.
- The user can reproduce a run from local inputs and artifacts.
- No daily development task requires OmniRoute or a hosted control plane.
- Existing career-ops commands and data files continue to work throughout migration.

## Practical Implementation Guidance

When implementation begins:

1. Add agent orchestration around existing scripts and modes; do not move the flat root.
2. Define typed handoff objects at agent boundaries, then serialize results into existing Markdown/TSV artifacts.
3. Centralize validation, evidence lookup, job-source normalization, and tracker writes in libraries.
4. Add compatibility tests before changing any behavior.
5. Make optional services feature-gated and default-off.
6. Treat the current missing user-layer files as an onboarding state, not as permission to synthesize candidate data.

## Explicit Non-Goals

- Autonomous mass application
- Hosted-first storage
- Replacing canonical Markdown/YAML with a database
- A new GUI outside VS Code for development
- Model-generated candidate achievements
- Breaking existing career-ops mode or script entrypoints
