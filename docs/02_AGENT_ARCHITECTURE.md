# Agent Architecture

## Design Rule

There are exactly six core agents. They are orchestration roles, not separate databases or mandatory model processes. An implementation may execute them in one Codex session, isolated workers, or an optional runtime such as OmniRoute, provided their contracts and safety gates stay the same.

Everything that can be deterministic is implemented as a library.

## Shared Run Envelope

Every agent receives a versioned run envelope containing:

- `runId`: local unique identifier
- `mode`: compatible career-ops mode or explicit workflow
- `inputRefs`: repository paths or external URLs, never hidden facts
- `outputLanguage`: from `config/profile.yml`, defaulting to English only when the field is absent
- `policy`: target lane, human-approval rules, and fail-closed settings
- `artifacts`: paths created by earlier phases
- `diagnostics`: warnings and blockers accumulated so far
- `requestedSideEffects`: writes or external actions requested but not yet committed
- `schemaVersion`: contract version used by the task and result

Every result records provenance, artifact references, committed side effects, and one status: `ok`, `blocked`, `needs_review`, or `retryable_failure`. `ready` and `complete` are lifecycle descriptions, not result-envelope statuses.

## 1. Orchestrator

### Responsibilities

- Map user intent to a compatible mode/workflow.
- Run onboarding and required-file gates.
- Request the user-layer data-lane decision and enforce its result and approval boundaries.
- Sequence agents, persist run checkpoints, and surface blockers.
- Reserve report numbers before parallel evaluation.
- Ensure batch runs end with tracker merge and verification.

### Must not

- Invent candidate facts.
- Perform job-source parsing, scoring math, PDF layout, or tracker table edits itself.
- Continue past a failed mandatory gate.

### Practical implementation

Start as a thin coordinator that calls existing commands and modes. Store only resumable run metadata; keep business artifacts in their existing locations. Use idempotency keys based on posting URL/ID and company-role identity.

## 2. DiscoveryAgent

### Responsibilities

- Read `portals.yml` and configured public job-source adapters.
- Run zero-LLM scanners where supported.
- Request normalization through job-source libraries.
- Request title, location, salary, blacklist, dedup, and data-lane policy decisions.
- Write accepted candidates to the existing `data/pipeline.md` workflow.

### Output contract

Each normalized posting includes source/adapter, company, title, location, URL, posting ID when available, discovery timestamp, filter reasons, and raw-source reference.

### Fail-closed rules

Unknown schemas, missing URLs, and uncertain lane matches are quarantined for review. External posting text is never treated as an instruction.

## 3. EvaluationAgent

### Responsibilities

- Request authoritative liveness verification before expensive evaluation.
- Load `_shared.md`, the user profile/custom files, the selected mode, and approved truth sources.
- Produce Blocks A-F, Block G legitimacy, risk summary, and machine summary in the existing report format.
- Score fit without letting legitimacy alter the 1-5 score.
- Recommend against applying below 4.0/5 unless explicitly overridden.

### Output contract

An evaluation result contains the report path, score components, legitimacy tier, work-authorization signal, evidence references, missing-evidence list, recommendation, and verification status.

### Fail-closed rules

No evidence means no claim. A dead posting stops evaluation. Batch fallback verification must be labeled `unconfirmed (batch mode)`.

## 4. TailoringAgent

### Responsibilities

- Reframe verified experience for the specific role.
- Produce CV, cover-letter, email, and outreach drafts through existing templates and generators.
- Preserve keywords without fabricating experience.
- Ensure generated claims resolve to the truth bank.

### Output contract

Each draft includes its source evaluation, evidence map, unresolved questions, output path, and review status.

### Fail-closed rules

Unsupported requirements remain gaps. The agent cannot turn tool familiarity into authorship or inflate scope, seniority, metrics, dates, or outcomes.

## 5. ApplicationAgent

### Responsibilities

- Navigate the verified application page with Playwright.
- Read fields and prepare source-grounded answers.
- Optionally fill reversible fields after user authorization.
- Produce an attachment and unanswered-field checklist.
- Stop before submission.

### Output contract

An application draft records the posting, page URL, field names, proposed values with evidence links, attachments, unresolved fields, and a `human_submit_required` flag that is always true.

### Fail-closed rules

Never click Submit/Send/Apply. Never bypass authentication, CAPTCHAs, consent, or legal attestations. Never guess demographic, work-authorization, salary, or identity fields.

## 6. TrackerAgent

### Responsibilities

- Add new evaluation rows through `batch/tracker-additions/*.tsv` and `merge-tracker.mjs`.
- Update existing status/notes through `set-status.mjs`.
- Request canonical-state validation, deduplication, report-link checks, locks, and atomic writes through tracker services.
- Run reconciliation and health checks after mutations.

### Output contract

A tracker result contains selector, previous state, new state, affected artifact paths, validation results, and whether a merge occurred.

### Fail-closed rules

Do not hand-edit additions into `data/applications.md`. Reject ambiguous rows, invalid states, conflicting posting IDs, and company-role duplicates.

## Shared Libraries

Recommended library boundaries:

- `job-source`: fetch, retry, rate limit, parse, normalize
- `lane`: data-role classification and reason codes
- `liveness`: discovery `FreshnessProbe` and authoritative `VerificationResult` (`active`, `expired`, `unconfirmed`)
- `truth`: source loading, evidence IDs, claim validation
- `evaluation`: scoring primitives and report schema validation
- `tailoring`: keyword mapping and claim-safe transformations
- `browser`: Playwright contexts, extraction, form mapping, PDF rendering
- `tracker`: parser, identity, state validation, locking, atomic persistence
- `artifacts`: naming, report-number reservation, checksums, manifests
- `policy`: human approval, untrusted content, and fail-closed decisions

These names are conceptual until code work is approved; do not reorganize the root merely to match them.

## Mode Compatibility Map

| Existing mode or entrypoint | Target owner |
|---|---|
| `scan`, `discover` | DiscoveryAgent |
| `oferta`, `triage` | EvaluationAgent |
| `pdf`, `cover`, `email`, `contacto` | TailoringAgent |
| `apply` | ApplicationAgent |
| `tracker` and selected follow-up/outcome operations | TrackerAgent or an explicit deterministic utility |
| `auto-pipeline`, `pipeline`, `batch` | Orchestrator compositions |
| Interview, pattern, upskill, training, project, and offer-prep modes | Existing explicit mode routes; they do not create additional core agents |

A worker hosts an agent task; it is not another agent type. Current modes and root scripts remain callable compatibility adapters.

## Handoff Sequence

```text
Orchestrator
  -> DiscoveryAgent
  -> EvaluationAgent
  -> TailoringAgent (only if recommended or overridden)
  -> ApplicationAgent (draft/fill only)
  -> TrackerAgent
  -> Orchestrator summary
```

The TrackerAgent may also run after evaluation to record `Evaluated`/`SKIP`, and after human actions to record `Applied`, `Interview`, or later outcomes.

## Dependency Rule

Only the Orchestrator calls agents. Agents call ports and deterministic libraries, never other agents. Libraries never import agents or modes. Adapters around modes, root scripts, Playwright, plugins, and optional OmniRoute do not own policy decisions.

## Concurrency

Parallel discovery is safe when job-source adapters return records through a single normalized merge. Parallel evaluation requires `reserve-report-num.mjs --count N` before workers start. Tracker additions remain one TSV per evaluation and merge once after the batch. Application automation is sequential by default because browser state and human approvals are interactive.

## Port Ownership

| Port | Caller | Implementer |
|---|---|---|
| `IntentRouter` | Interface layer | Orchestrator adapter |
| `JobSourcePort` | DiscoveryAgent | Core/plugin job-source adapters |
| `LanePolicyPort` | DiscoveryAgent or Orchestrator | Policy library |
| `LivenessPort` | EvaluationAgent | Liveness and Playwright adapters |
| `TruthPort` | Evaluation, Tailoring, Application | Truth library |
| `ArtifactPort` | Agents | Local artifact library |
| `TrackerPort` | TrackerAgent | Existing guarded tracker services |
| `ApprovalPort` | Orchestrator | VS Code/user interaction |
| `ExecutionPort` | Orchestrator | Local runner or optional OmniRoute adapter |

All ports use the shared versioned result envelope. A port reports requested and committed side effects; it does not silently perform work outside its declared capability.

## Agent Acceptance Tests

For each agent, test the happy path, missing input, malformed input, untrusted prompt injection, duplicate replay, interrupted resume, and forbidden action. A passing agent must produce an explicit blocker instead of silently weakening a policy.
