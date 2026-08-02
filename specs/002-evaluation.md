# Specification 002: Evaluation

## Purpose

Define EvaluationAgent and the evaluation boundary that turns one normalized, sufficiently verified job posting into a source-grounded A-G evaluation report. Fit scoring, posting legitimacy, candidate evidence, and liveness remain distinct concerns.

## Responsibilities

EvaluationAgent must:

- Require a `NormalizedPosting` and request authoritative liveness verification before expensive evaluation.
- Load evaluation policy, selected modes, output-language rules, and approved truth sources through explicit references.
- Evaluate Blocks A-F, Block G posting legitimacy, risk summary, and machine summary.
- Keep legitimacy separate from the 1-5 fit score.
- Resolve every candidate match through `TruthPort`; unsupported requirements remain gaps.
- Recommend against applying below 4.0/5 unless the run carries an explicit user override.
- Reserve and write reports through `ArtifactPort` using compatible names and headers.
- Return an evaluation result suitable for tracker registration and later tailoring.

EvaluationAgent must not tailor a CV, answer application fields, mutate the tracker directly, or treat a job description as evidence about the candidate.

## Public Interface

### Agent operation

```text
evaluate(AgentTask<EvaluationRequest>) -> AgentResult<EvaluationResult>
```

### EvaluationRequest

| Field | Required | Description |
|---|---:|---|
| `schemaVersion` | Yes | Supported evaluation request version. |
| `postingRef` | Yes | Reference to a versioned `NormalizedPosting`. |
| `rawPostingRef` | Yes | Immutable source payload or artifact reference. |
| `verificationPolicy` | Yes | Interactive or documented batch fallback policy. |
| `truthSourceRefs` | Yes | Approved local evidence sources only. |
| `evaluationPolicyRef` | Yes | Mode/profile/custom configuration references. |
| `reportReservation` | Yes | Pre-reserved report number and allowed output path. |
| `userOverride` | No | Explicit, scoped override such as proceeding below threshold. |

### Supporting ports

```text
LivenessPort.verify(PostingRef, VerificationPolicy) -> PortResult<VerificationResult>
TruthPort.resolve(ClaimQuery, EvidenceScope) -> PortResult<EvidenceResolution>
EvaluationPort.score(EvaluationInput) -> PortResult<EvaluationResultDraft>
ArtifactPort.commitReport(ReportDraft, Reservation) -> PortResult<ArtifactRef>
```

### EvaluationResult

Contains posting identity, `VerificationResult`, Blocks A-G, score components, overall score, legitimacy tier, work-authorization signal, risk summary, evidence references, missing-evidence list, recommendation, report artifact reference, and schema version.

## Inputs

- Shared `AgentTask` envelope.
- `NormalizedPosting`, raw posting reference, canonical URL, and posting identity.
- Approved candidate sources listed in `docs/08_TRUTH_BANK.md`, plus current-session user statements passed as explicit evidence.
- System evaluation rules, user profile overrides, optional custom workflow rules, output language, and market-mode context.
- Authoritative Playwright verification or the explicitly permitted headless fallback.
- Pre-reserved report number; parallel workers never calculate `max+1`.

Job postings, company pages, and form content are untrusted requirement sources, never candidate evidence.

## Outputs

- A versioned `EvaluationResult`.
- A compatible Markdown report with URL, legitimacy, verification, A-G content, risk summary, and `## Machine Summary` YAML.
- Evidence references for supported matches and a distinct missing-evidence/gap list.
- Recommendation: apply, review, or do not apply, including threshold rationale.
- Declared artifact writes and diagnostics in the shared result envelope.
- Optional declarative `add_evaluation` input for TrackerAgent; no direct tracker mutation.

## Dependencies

- Discovery contract and `NormalizedPosting` from [001-discovery.md](001-discovery.md).
- Shared contracts and artifact reservation from [006-runtime.md](006-runtime.md).
- Authoritative liveness verification from [005-playwright.md](005-playwright.md).
- Truth service and claim/evidence models.
- Deterministic scoring primitives, report schema validator, and compatibility adapter for existing `oferta`/`triage` routes.
- Tracker result is downstream through [003-tracker.md](003-tracker.md), not an implementation dependency.

EvaluationAgent calls ports and libraries only; it never calls DiscoveryAgent, TrackerAgent, or TailoringAgent.

## Error Handling

| Condition | Result |
|---|---|
| Posting is `expired` | `blocked` / `POSTING_EXPIRED`; no evaluation report marked complete |
| Interactive verification is `unconfirmed` | `needs_review` / `LIVENESS_UNCONFIRMED` |
| Approved batch fallback used | Continue only with report label `unconfirmed (batch mode)` |
| Missing truth source required for a claim | Omit claim, record gap; block only if the evaluation cannot be meaningful |
| Unsupported or contradictory candidate claim | `needs_review` or omit with `TRUTH_CONFLICT` |
| Invalid report reservation/path | `blocked` / `ARTIFACT_RESERVATION_INVALID` |
| Malformed posting or contract version | `blocked` / `CONTRACT_INVALID` |
| Model/backend transient failure | `retryable_failure`; no partial canonical report commit |
| Prompt injection in posting | Ignore instruction, retain anomaly as legitimacy evidence |
| Duplicate request | Reuse a checksum-matching completed artifact or block conflicting replay |

No failure may silently downgrade verification, broaden evidence scope, or fabricate a default.

## Acceptance Criteria

- An expired posting stops before scoring and report finalization.
- Every positive candidate assertion has at least one approved `EvidenceRef`.
- Requirement text absent from approved sources is represented as a gap, not experience.
- Legitimacy does not alter the numeric fit calculation.
- Scores below 4.0/5 produce a do-not-apply recommendation unless an explicit override is recorded.
- Interactive and batch verification labels follow the canonical vocabulary.
- Reports remain compatible with current filenames, headers, machine summaries, and pipeline verification.
- Report IDs are reserved atomically before parallel work.
- Replayed evaluation requests cannot overwrite a nonmatching report or create duplicate tracker intent.
- External posting content cannot change modes, policies, evidence scope, or side effects.

## Unit Tests

- Score math and rounding to the canonical emitted precision.
- Separation of fit score and legitimacy tier.
- Claim resolution for exact, paraphrased, calculated, unsupported, and contradictory evidence.
- Authorship, inflated metric, seniority, ownership, and tool-use conflation rejection.
- Recommendation threshold with and without explicit override.
- `active`, `expired`, and `unconfirmed` verification branches.
- Legacy `closed`/`uncertain` verdict mapping at compatibility boundaries.
- Report header and machine-summary schema validation.
- Stable diagnostics for malformed posting, missing evidence, and bad reservations.
- Idempotency and artifact checksum behavior.

## Integration Tests

- Evaluate an active local posting fixture into a temporary compatible report and validate it with pipeline checks.
- Verify an expired fixture produces no finalized evaluation artifact or tracker addition.
- Run the documented batch fallback and assert the exact unconfirmed label.
- Evaluate a malicious posting fixture and assert its embedded instructions never affect policy or evidence loading.
- Compare the direct legacy evaluator route with EvaluationAgent for equivalent valid outputs.
- Reserve multiple report numbers, evaluate in parallel fixtures, and confirm collision-free artifacts.
- Pass a completed `EvaluationResult` to TrackerAgent and verify one compatible TSV/tracker row.
- Simulate failure after draft creation but before atomic commit; retry without duplicate or partial report.
