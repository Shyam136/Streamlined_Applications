# Documentation Strategy

## Purpose

This strategy defines a clean documentation hierarchy for career-ops. It classifies the current Markdown corpus, identifies duplicated responsibilities, and assigns one canonical owner to each kind of information.

This is a recommendation only. No files have been moved, renamed, or deleted as part of this review.

## Executive Recommendation

Keep five distinct documentation classes:

1. **Normative project contracts** at the repository root.
2. **Permanent architecture documents** in the numbered `docs/00_...09_...` suite.
3. **Implementation specifications** in `specs/`.
4. **Operator and contributor guides** in `docs/` and component directories.
5. **Historical artifacts and generated outputs** outside the active documentation path.

The most important cleanup is to retire `docs/ARCHITECTURE.md` after its unique content is merged into the root `ARCHITECTURE.md` or numbered architecture suite. The repository currently has three documents competing to describe the system architecture: `ARCHITECTURE.md`, `docs/ARCHITECTURE.md`, and `docs/01_SYSTEM_DESIGN.md`.

The numbered architecture suite should explain **why the system is shaped this way and which boundaries are permanent**. The specifications should define **the exact interfaces, inputs, outputs, errors, acceptance criteria, and tests to implement**. Operator guides should explain **how to use the current implementation**. Historical documents should never be treated as current requirements.

## Proposed Authority Order

When documents disagree, use this order:

1. `AGENTS.md` and `DATA_CONTRACT.md` for enforced safety, truth, personalization, and update boundaries.
2. Root `ARCHITECTURE.md` for stable system doctrine and the architecture index.
3. `docs/00_VISION.md` through `docs/09_TESTING.md` for detailed target architecture.
4. `specs/*.md` for implementation contracts, provided they do not override levels 1-3.
5. Current operator guides and command references for implemented behavior.
6. Historical reviews, plans, and changelogs for context only.
7. Generated reports and fixtures as outputs or test data, never design authority.

`README.md` is the product landing page, not an architecture authority. Root CLI files such as `CODEX.md`, `CLAUDE.md`, `KIMI.md`, `OPENCODE.md`, and `GEMINI.md` are harness entrypoints or compatibility shims, not competing manuals.

## Current Duplication Findings

### Architecture overview

| Documents | Duplication | Recommendation |
|---|---|---|
| `ARCHITECTURE.md`, `docs/ARCHITECTURE.md`, `docs/01_SYSTEM_DESIGN.md` | All describe system structure, data flow, canonical files, and runtime behavior. | Keep root `ARCHITECTURE.md` as a concise authoritative overview/index. Keep `01_SYSTEM_DESIGN.md` as the detailed design. Merge any unique content from `docs/ARCHITECTURE.md`, then retire that file. |
| `README.md`, `docs/00_VISION.md`, `MANIFESTO.md` | Product purpose and principles appear in all three. | Let `README.md` answer what/how to start, `00_VISION.md` define target product boundaries, and `MANIFESTO.md` remain community philosophy. Do not repeat detailed principles across them. |

### Architecture versus implementation contracts

| Architecture document | Overlapping specification | Canonical split |
|---|---|---|
| `docs/02_AGENT_ARCHITECTURE.md` | All six `specs/*.md`, especially `006-runtime.md` | Architecture owns agent count, responsibility boundaries, dependency direction, and mode ownership. Specs own callable interfaces and acceptance tests. |
| `docs/04_RUNTIME.md` | `specs/006-runtime.md` | Architecture owns runtime profiles, local-first doctrine, lifecycle concepts, and OmniRoute boundary. The spec owns task/result schemas, execution operations, retry semantics, and orchestration acceptance. |
| `docs/05_PROVIDER_ARCHITECTURE.md` | `specs/001-discovery.md` | Architecture owns job-source boundaries, trust rules, and normalization principles. The spec owns DiscoveryAgent and `JobSourcePort` contracts. |
| `docs/06_PLAYWRIGHT.md` | `specs/005-playwright.md` | Architecture owns the browser safety boundary and authoritative-verification doctrine. The spec owns operations, inputs, results, error codes, and tests. |
| `docs/07_TRACKER.md` | `specs/003-tracker.md` | Architecture owns file-canonical persistence and the one-writer doctrine. The spec owns `TrackerCommand`, `TrackerResult`, idempotency, and test cases. |
| `docs/08_TRUTH_BANK.md` | `specs/002-evaluation.md`, `specs/004-tailoring.md`, `AGENTS.md`, `DATA_CONTRACT.md` | `AGENTS.md` and `DATA_CONTRACT.md` remain normative. The architecture doc explains the evidence model. Specs define how evaluation and tailoring consume it. |
| `docs/09_TESTING.md` | Test sections in every spec and `tests/README.md` | Architecture owns test strategy and global gates. Specs own feature-specific cases. `tests/README.md` owns current test-running instructions. |

The architecture documents should eventually remove field-by-field interface descriptions already owned by a specification. Conversely, specifications should link to architecture policy instead of copying its rationale and permanent rules at length.

### Planning and history

| Documents | Duplication | Recommendation |
|---|---|---|
| `docs/ARCHITECTURE_REVIEW.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/CHANGELOG_ARCHITECTURE.md` | The same 15 findings and resolutions are repeated as review, plan, and changelog. | Treat all three as time-bound architecture history. Keep them during implementation, then archive together after findings are represented in issues/spec status. |
| `docs/IMPLEMENTATION_PLAN.md`, `docs/ROADMAP.md` | Both contain phases, dependency order, deliverables, and exit gates. | Keep `ROADMAP.md` as the short forward-looking milestone view. Freeze the implementation plan as the detailed historical plan once work tracking moves to issues/specs. Do not maintain both as live plans. |

### Operator documentation

| Documents | Duplication | Recommendation |
|---|---|---|
| `README.md`, `docs/SETUP.md`, `docs/FAQ.md` | Installation and first-use instructions recur. | `README.md` gets a minimal quick start, `SETUP.md` owns complete setup, and `FAQ.md` contains only exceptions/troubleshooting with links back to setup. |
| `docs/RUNNING_ON_A_BUDGET.md`, `docs/FREE_TIER.md`, `docs/AUTOMATION.md` | Model cost, scan cost, batch use, and scheduling overlap. | Make `RUNNING_ON_A_BUDGET.md` the canonical cost/model guide. Keep `AUTOMATION.md` for scheduling only. Merge the unique Antigravity limits from `FREE_TIER.md` into the budget guide or retain `FREE_TIER.md` as a short platform-specific page. |
| `docs/SUPPORTED_CLIS.md`, `docs/CODEX.md`, `docs/COWORK.md`, root CLI shim files | Invocation guidance and runtime compatibility overlap. | `SUPPORTED_CLIS.md` owns the compatibility matrix. Per-CLI guides contain only platform-specific workflows. Root shims stay minimal and point to `AGENTS.md` or the relevant guide. |
| `docs/SCRIPTS.md`, `README.md`, mode files | Commands and mode behavior are repeated. | `SCRIPTS.md` owns script syntax. `README.md` lists only common entrypoints. Mode files remain executable instructions and are not general documentation. Generate script tables from command metadata where practical. |
| `docs/APPLY_AUTOFILL.md`, `docs/06_PLAYWRIGHT.md`, `specs/005-playwright.md` | Browser workflow and submission boundaries recur. | `APPLY_AUTOFILL.md` owns user workflow/troubleshooting, the architecture doc owns safety doctrine, and the spec owns implementation contracts. |
| `docs/SUPPORTED_JOB_BOARDS.md`, `providers/README.md`, `docs/05_PROVIDER_ARCHITECTURE.md`, `specs/001-discovery.md` | Adapter inventory, extension guidance, and interfaces overlap. | Generate the supported-board matrix from the adapter registry. Keep `providers/README.md` as contributor instructions, the architecture doc as design policy, and the spec as the target API. |
| `docs/PLUGINS.md`, `docs/PLUGIN_REVIEW.md`, `plugins/README.md`, plugin `skill.md` files | Plugin use, authoring, review, and runtime instructions are distributed. | Keep the separation, but give each one role: user/author guide, maintainer review, package index, and executable plugin instructions respectively. Remove repeated policy text in favor of links to `AGENTS.md`. |

### Deliberate derivatives that are not independent documentation

- `README.<locale>.md` files are translations of `README.md`. They should be treated as generated or synchronized derivatives, not separately authored sources of truth.
- `modes/**/*.md` files are executable workflow/prompt definitions. They belong to the product runtime, not the documentation hierarchy.
- `.agents/skills/**/SKILL.md` and plugin `skill.md` files are executable agent instructions, not user guides.
- `examples/**/*.md` are examples and fixtures. They must not become normative contracts or candidate truth.
- `test-fixtures/**/*.md` are test data. They should never be linked as current user documentation.
- Component `README.md` files under `dashboard/`, `providers/`, `plugins/`, `scaffolder/`, `templates/`, `tests/`, and similar directories are locally scoped contributor documentation.

## Permanent Architecture Documents

The following should remain the permanent architecture set:

| Document | Permanent responsibility |
|---|---|
| `ARCHITECTURE.md` | Short authoritative overview, permanent doctrines, dependency direction, and links to detailed architecture. |
| `docs/00_VISION.md` | Product vision, scope, non-negotiable outcomes, and non-goals. |
| `docs/01_SYSTEM_DESIGN.md` | Detailed component model, project decisions, precedence, compatibility, and system-level failure boundaries. |
| `docs/02_AGENT_ARCHITECTURE.md` | Exactly six agents, ownership matrix, agent/non-agent distinction, and dependency rules. |
| `docs/03_DATA_FLOW.md` | Canonical flows, message sequences, side-effect gates, and human checkpoints. |
| `docs/04_RUNTIME.md` | Runtime profiles, local development doctrine, lifecycle concepts, egress labels, and optional execution infrastructure. |
| `docs/05_PROVIDER_ARCHITECTURE.md` | Job-source adapter principles, source trust, normalization boundaries, and extension policy. Consider renaming it later to `05_JOB_SOURCE_ARCHITECTURE.md`; retain the current path until links are migrated. |
| `docs/06_PLAYWRIGHT.md` | Browser authority, safety boundary, liveness doctrine, and prohibition on autonomous submission. |
| `docs/07_TRACKER.md` | Canonical-file doctrine, identity/state principles, one-writer rule, and recovery expectations. |
| `docs/08_TRUTH_BANK.md` | Evidence architecture and claim model, with normative rules linked to `AGENTS.md` and `DATA_CONTRACT.md`. |
| `docs/09_TESTING.md` | Test strategy, global compatibility/security gates, and test-layer ownership. |

These documents should be stable and conceptual. They should not repeat complete command references, detailed interface tables owned by specs, or transient implementation status.

## Implementation Specifications

The following should remain in `specs/` and be treated as implementation contracts:

| Specification | Contract ownership |
|---|---|
| `specs/001-discovery.md` | DiscoveryAgent, job-source operations, normalized discovery results, filtering, and scan tests. |
| `specs/002-evaluation.md` | EvaluationAgent, evidence-backed evaluation, liveness dependency, report output, and evaluation tests. |
| `specs/003-tracker.md` | TrackerAgent, tracker commands/results, idempotent mutation behavior, and tracker tests. |
| `specs/004-tailoring.md` | TailoringAgent, claim-safe artifacts, evidence maps, rendering requests, and tailoring tests. |
| `specs/005-playwright.md` | Playwright service interfaces, verification, extraction, rendering, reversible filling, and submit prohibition. |
| `specs/006-runtime.md` | Shared contracts, Orchestrator, execution port, lifecycle, compatibility routing, and optional OmniRoute adapter. |

Specifications should have explicit status metadata when implementation starts: `proposed`, `accepted`, `implementing`, `implemented`, or `superseded`. A specification becomes historical only when superseded by another numbered specification; implementation does not make it disposable.

ApplicationAgent does not yet have a dedicated specification. Its responsibilities are currently split across agent architecture, Playwright, and runtime documents. Add a separate application specification only when ApplicationAgent implementation is scheduled; do not create it merely to make the numbering appear complete.

## Historical Artifacts

These documents should become read-only historical records once the specification set is accepted and implementation work is tracked elsewhere:

| Document | Historical reason | Recommended disposition |
|---|---|---|
| `docs/ARCHITECTURE_REVIEW.md` | Point-in-time diagnosis of the pre-alignment documentation. | Move later to `docs/history/architecture/2026-08/` or retain outside the active docs index. |
| `docs/CHANGELOG_ARCHITECTURE.md` | Records the documentation-alignment event, not ongoing system behavior. | Archive beside the review. Future architecture changes belong in normal release history or narrowly scoped decision records. |
| `docs/IMPLEMENTATION_PLAN.md` | Transitional phase plan that the specifications now decompose. | Keep active only until work items are created; then freeze and archive. |
| Completed snapshots of `docs/ROADMAP.md` | Past milestones are useful context but should not accumulate in the live roadmap. | Keep one current roadmap; move completed snapshots to release notes/history only when preservation is valuable. |
| `TEST_OMNIROUTE.md` | Scratch/test artifact rather than project documentation. | Remove after its test purpose is complete, or move into an explicit test fixture directory if a test consumes it. Do not index it as documentation. |

Historical files should start with a visible notice stating that they are non-normative and naming the current replacement. They should not be returned by the primary documentation navigation.

## Generated Reports and Generated References

### Generated operational reports

The following are outputs, not documentation:

- `reports/*.md`: numbered job evaluation reports.
- `interview-prep/{company}-{role}.md` and session rollups: user-specific working artifacts.
- `output/*`: rendered CVs, PDFs, letters, and other generated application artifacts.
- `batch/*` runtime results and tracker additions, except committed contributor instructions/scripts.
- Generated analysis summaries under user-layer `data/` or `reports/` paths.

Generated reports must remain outside `docs/`, use the established naming conventions, and never become architecture evidence or candidate truth without an approved underlying source.

### Generated documentation references

Some reference documents should be generated or mechanically verified because manual copies drift:

- `docs/SUPPORTED_JOB_BOARDS.md` from the job-source adapter registry and capabilities.
- Command tables in `docs/SCRIPTS.md` from script metadata/help output where possible.
- `docs/SUPPORTED_CLIS.md` from the maintained CLI support registry if one is introduced.
- `README.<locale>.md` translations from a controlled translation workflow anchored to `README.md`.

Generated references should contain a banner naming their generator/source and should reject direct manual edits in CI. They are reference material, not generated operational reports.

## Target Repository Shape

Preserve stable paths initially and use an index rather than performing a cosmetic mass move:

```text
README.md                     product landing page
AGENTS.md                     enforced agent behavior
DATA_CONTRACT.md              enforced data/update boundary
ARCHITECTURE.md               architecture overview and index

docs/
  README.md                   recommended navigation and category index
  00_VISION.md ... 09_TESTING.md
                              permanent architecture suite
  SETUP.md, CUSTOMIZATION.md, ...
                              operator/contributor guides
  history/                    archived reviews and completed plans

specs/
  001-discovery.md ...        accepted implementation contracts

reports/                      generated evaluation reports
output/                       generated user artifacts
test-fixtures/                synthetic test data, not documentation
```

Avoid adding `docs/architecture/`, `docs/guides/`, and `docs/reference/` merely to reorganize files. The move would create link churn without reducing content. A concise `docs/README.md` index and explicit document ownership provide most of the benefit. Move only historical material whose removal from active navigation is meaningful.

## Document Ownership Rules

Each durable fact should have exactly one owner:

| Information | Canonical owner |
|---|---|
| Safety, truth-source, personalization, update rules | `AGENTS.md` and `DATA_CONTRACT.md` |
| Stable architecture doctrine | Root `ARCHITECTURE.md` |
| Detailed architecture rationale/boundaries | Numbered architecture suite |
| Exact target interfaces and acceptance tests | `specs/*.md` |
| Current command syntax | `docs/SCRIPTS.md` or command help |
| Current setup procedure | `docs/SETUP.md` |
| Supported job-source inventory | Generated `docs/SUPPORTED_JOB_BOARDS.md` |
| Current milestone sequence | `docs/ROADMAP.md` |
| Release changes | `CHANGELOG.md` |
| User-specific operational results | `reports/`, `data/`, `output/`, or `interview-prep/` as defined by the data contract |

Other documents should link to the owner and summarize only enough context to remain readable.

## Lifecycle Rules

1. Every new document must declare its category and canonical owner before it is added.
2. Prefer updating an existing owner over creating a new topical document.
3. A new spec requires a unique implementation boundary, not merely a component name.
4. Architecture documents describe enduring decisions; transient task lists belong in issues or a time-bound plan.
5. Operator guides document implemented behavior only. Planned behavior belongs in architecture/specs and must be labeled.
6. Historical artifacts are frozen except for an archive banner or corrected link.
7. Generated references are updated by their source/generator, not by parallel manual edits.
8. Generated operational reports never live in `docs/`.
9. Localized translations cannot introduce content absent from the canonical English source.
10. Documentation checks should validate local links, referenced commands, duplicate top-level titles, and status metadata.

## Recommended Cleanup Order

1. Add a small `docs/README.md` navigation index identifying architecture, specs, guides, history, and generated outputs.
2. Merge unique content from `docs/ARCHITECTURE.md` into root `ARCHITECTURE.md` or the numbered suite, then retire the duplicate.
3. Mark the six specs with lifecycle status and make them the sole owners of detailed public interfaces and acceptance tests.
4. Reduce repeated contract detail in component architecture documents to stable rationale and boundaries.
5. Freeze and archive the architecture review/changelog; archive the implementation plan once its work is represented by specs/issues.
6. Choose one live planning surface: keep `docs/ROADMAP.md` concise and forward-looking.
7. Consolidate setup, budget/free-tier, CLI, and browser operator overlap using the ownership table above.
8. Generate high-drift references such as supported boards and script tables from maintained registries/metadata.
9. Remove or relocate scratch Markdown such as `TEST_OMNIROUTE.md` when its explicit test purpose ends.
10. Add CI checks for broken links, stale generated references, duplicate architecture titles, and historical files appearing in active navigation.

## Success Criteria

The documentation hierarchy is healthy when:

- A reader can find the current architecture from one root entrypoint.
- Each architectural rule, interface, command, and plan has one canonical owner.
- Architecture and specs complement rather than mirror one another.
- Historical reviews cannot be mistaken for current requirements.
- Generated reports and fixtures are clearly separated from documentation.
- Root harness files remain minimal and do not duplicate operator manuals.
- New documentation is added only when no existing owner can hold the information cleanly.
