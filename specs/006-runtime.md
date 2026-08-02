# Specification 006: Runtime and Orchestration

## Purpose

Define the shared versioned contracts, local execution runtime, Orchestrator, compatibility routing, resumable lifecycle, observability, and optional OmniRoute execution adapter for the six-agent architecture.

The full workflow must run locally from VS Code with Codex and existing root commands. OmniRoute is optional infrastructure implementing only `ExecutionPort`.

## Responsibilities

The runtime contract layer must:

- Define versioned domain records, `AgentTask`, `AgentResult`, port results, diagnostics, and side-effect declarations.
- Provide local execution, cancellation, timeout, retry, idempotency, artifact-reference, and redaction semantics.
- Keep canonical Markdown/YAML/TSV artifacts local and file-authoritative.

The Orchestrator must:

- Route current modes and natural-language requests through `IntentRouter`.
- Run startup, onboarding, policy, and human-approval gates.
- Build phase plans and invoke agents through `ExecutionPort`.
- Persist derived checkpoints and resume without duplicate artifacts.
- Reserve report IDs before fan-out, bound worker pools, and merge tracker additions once.
- Coordinate retries without absorbing specialist business logic.
- Summarize artifacts and diagnostics for the user.

The Orchestrator must not parse job sources, score postings, validate claims, compose tailored prose, manipulate browser pages, or rewrite tracker tables itself. Agents never call one another.

## Public Interface

### AgentTask

| Field | Required | Description |
|---|---:|---|
| `schemaVersion` | Yes | Contract version. |
| `taskId` | Yes | Unique task identity. |
| `runId` | Yes | Parent run identity. |
| `agentType` | Yes | One of the six fixed core agents. |
| `mode` | Yes | Compatible mode or explicit workflow. |
| `inputRefs` | Yes | Repository/external references; no hidden facts. |
| `outputLanguage` | Yes | Human-facing language. |
| `policyRefs` | Yes | Versioned policy references. |
| `artifactRefs` | Yes | Earlier-phase artifacts. |
| `diagnostics` | Yes | Accumulated safe diagnostics. |
| `requestedSideEffects` | Yes | Exact writes/external actions requested. |
| `idempotencyKey` | Yes | Stable logical replay identity. |
| `deadline` | No | Absolute deadline/cancellation metadata. |

### AgentResult

```text
status: ok | blocked | needs_review | retryable_failure
```

It also contains `schemaVersion`, task/run/phase identity, typed payload reference, diagnostics, artifacts, requested and committed side effects, timing, retry metadata, and checkpoint reference.

### ExecutionPort

```text
execute(AgentTask) -> AgentResult
cancel(TaskId, Reason) -> CancellationResult
capabilities() -> ExecutionCapabilities
```

Local execution is mandatory. OmniRoute may implement the same port without adding fields to domain models.

### IntentRouter and Orchestrator

```text
route(IntentInput) -> PortResult<WorkflowPlan>
start(WorkflowPlan) -> RunResult
resume(RunId) -> RunResult
cancel(RunId, Reason) -> RunResult
inspect(RunId) -> RunSnapshot
```

### Required domain records

The contract package includes versioned `RunManifest`, `ExternalSourceRef`, `RawPosting`, `NormalizedPosting`, `PostingIdentity`, `LaneDecision`, `FreshnessProbe`, `VerificationResult`, `EvidenceRef`, `Claim`, `EvaluationResult`, `TailoredArtifact`, `ApplicationDraft`, `TrackerCommand`, `TrackerResult`, and `Diagnostic`.

`RunManifest` and indexes are derived metadata. Deleting them cannot make canonical artifacts uninterpretable.

## Inputs

- User intent, compatible mode invocation, or root-command adapter request.
- Repository configuration and approved user/system files according to the data contract.
- Current canonical artifacts and optional derived checkpoints/indexes.
- Runtime profile: interactive, headless batch, or deterministic script.
- Explicit resource budgets, model-backend choice, privacy/egress label, and optional OmniRoute configuration.
- Human approvals scoped to the exact reviewed artifact/action.

## Outputs

- A versioned workflow plan and derived run/checkpoint records.
- Typed agent tasks/results and phase diagnostics.
- References to canonical reports, pipeline entries, tracker changes, and tailored artifacts committed through their owning ports.
- Accurate runtime labels: `local-storage`, `zero-LLM`, `local-model`, or `hosted-model`.
- A final summary distinguishing success, blockers, review requirements, retries, and partial completion.

The runtime never turns logs, indexes, or manifests into candidate truth or canonical business storage.

## Dependencies

- Domain contract/schema package implemented before all agent coordinators.
- Deterministic policy, truth, liveness, artifact, tracker, job-source, browser, and rendering services.
- Specialist specifications: [001-discovery.md](001-discovery.md), [002-evaluation.md](002-evaluation.md), [003-tracker.md](003-tracker.md), [004-tailoring.md](004-tailoring.md), and [005-playwright.md](005-playwright.md).
- Existing mode files, root scripts, startup checks, report reservation, merge, verification, and update boundaries through compatibility adapters.
- Local structured logging and secret-redaction utilities.
- Optional OmniRoute adapter behind a default-off configuration flag.

Dependency direction is interface/Orchestrator to agents, agents to ports, ports/services to low-level adapters and models. Libraries never import agents, modes, or the Orchestrator. Compatibility adapters do not own policy.

### Delivery order

1. Shared models, schemas, port/result contracts, and local execution stub from this specification.
2. Deterministic Playwright/liveness, artifact, truth, and tracker services.
3. TrackerAgent.
4. DiscoveryAgent.
5. EvaluationAgent.
6. TailoringAgent.
7. ApplicationAgent using the Playwright boundary.
8. Orchestrator and compatibility routing from this specification.
9. Scale/observability hardening.
10. Optional OmniRoute adapter.

## Error Handling

| Condition | Result |
|---|---|
| Missing onboarding prerequisite | `blocked` / `ONBOARDING_REQUIRED` |
| Unsupported schema/version | `blocked` / `CONTRACT_VERSION_UNSUPPORTED` |
| Policy or evidence blocker | Preserve specialist `blocked` result; never weaken it |
| Human review required | Pause as `needs_review` with exact approval scope |
| Transient execution failure | `retryable_failure` with retry ceiling/backoff metadata |
| Deadline/cancellation | Stop new side effects, checkpoint safe state, report partial commits |
| Duplicate task/run replay | Resume or return existing logical result using idempotency identity |
| Partial batch failure | Preserve completed reservations/artifacts, merge valid additions, expose resumable failures |
| Invalid returned artifact reference | Reject before local commit |
| OmniRoute unavailable/malformed/version mismatch | Use configured explicit local path or stop; never silently change sensitive backend policy |
| Log serialization/redaction failure | Fail safe without exposing raw sensitive content |

Side effects must be declared before execution and reported afterward. A result may never claim an uncommitted artifact.

## Acceptance Criteria

- All agent and service boundaries use versioned, serialization-safe contracts.
- Every boundary result uses exactly `ok`, `blocked`, `needs_review`, or `retryable_failure`.
- Existing modes and root commands remain valid compatibility routes.
- The complete workflow works without OmniRoute.
- Only the Orchestrator invokes agents; dependency checks find no agent-to-agent calls.
- Canonical files remain independently interpretable; indexes and manifests are rebuildable.
- Resume/replay produces no duplicate report, pipeline entry, tracker row, or external action.
- Parallel evaluation reserves report numbers before fan-out and performs deterministic tracker merge checkpoints.
- Human approval is required before submission and factual-profile mutation; the runtime cannot override this.
- Runtime labels accurately describe model use, data egress, and network access.
- Logs are local, structured, bounded, and free of secrets/sensitive browser state.
- OmniRoute can neither write canonical files nor own workflow/policy decisions.

## Unit Tests

- Schema validation and forward/unsupported version handling for every domain record.
- `AgentTask`, `AgentResult`, `Diagnostic`, side-effect, retry, and cancellation semantics.
- Intent routing for current modes and natural-language auto-pipeline detection.
- Workflow-plan construction and invalid transition rejection.
- Run lifecycle: created, preflight, executing, needs_review, complete, blocked, retryable_failure.
- Idempotency-key construction and duplicate task/result reconciliation.
- Resource-budget enforcement and retry ownership.
- Artifact-reference validation and path containment.
- Redaction of secrets, browser state, sensitive answers, and hidden environment values.
- Architecture dependency rules and the absence of OmniRoute fields in domain contracts.

## Integration Tests

- Run a local fixture workflow from discovery through prepared application and tracker registration, stopping before submit.
- Exercise each existing mode/root-command compatibility route and compare contract-visible outcomes.
- Interrupt after report reservation, report commit, TSV creation, and tracker merge; resume each without duplicates.
- Run a mixed-success parallel batch and verify partial completion, one merge checkpoint, and resumable failures.
- Delete run manifests and derived SQLite indexes, rebuild them, and prove canonical artifacts remain intact.
- Exercise hosted-model and zero-LLM profiles and verify accurate egress/cost labels.
- Run local `ExecutionPort` and a fake OmniRoute adapter against the same task/result contract.
- Test OmniRoute outage, timeout, malformed result, version mismatch, duplicate replay, and configuration removal.
- Verify an OmniRoute result cannot directly commit tracker or canonical-file writes.
- Run the existing full suite, updater migration tests, and pipeline verification in a correctly installed checkout.
