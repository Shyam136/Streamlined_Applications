# Specification 001: Discovery

## Purpose

Define DiscoveryAgent and its deterministic job-source pipeline. Discovery converts configured public job sources into normalized, policy-filtered posting candidates for the existing `data/pipeline.md` workflow without using an LLM when deterministic adapters are sufficient.

This specification preserves `scan.mjs`, `scan-ats-full.mjs`, `scan-interamt.mjs`, local parsers, plugin discovery hooks, `portals.yml`, and the current scan history files as compatible entrypoints and artifacts.

## Responsibilities

DiscoveryAgent must:

- Validate discovery configuration and select job-source adapters.
- Request bounded, resumable scans through `JobSourcePort`.
- Normalize core and plugin results into one versioned `NormalizedPosting` model.
- Request lane, blacklist, title, location, compensation, work-authorization, and deduplication decisions from deterministic policy services.
- Distinguish successful empty results from source failures.
- Produce declarative pipeline-write intents through the artifact/persistence boundary.
- Preserve raw source identity, retrieval metadata, diagnostics, and filter reasons.
- Report source health and scan counters separately from accepted matches.

DiscoveryAgent must not score fit, create candidate claims, write tracker rows, verify a posting authoritatively, or execute instructions embedded in external content.

## Public Interface

### Agent operation

```text
discover(AgentTask<DiscoveryRequest>) -> AgentResult<DiscoveryResult>
```

### DiscoveryRequest

| Field | Required | Description |
|---|---:|---|
| `schemaVersion` | Yes | Supported discovery request version. |
| `sourceRefs` | Yes | References to `portals.yml`, explicit source configs, or pipeline inputs. |
| `targetLanePolicyRef` | Yes | User-layer policy reference; never an embedded shared default. |
| `filters` | Yes | Title, location, blacklist, compensation, authorization, and date rules. |
| `cursor` | No | Resume cursor or checkpoint reference. |
| `limits` | Yes | Page, item, time, concurrency, and per-source request budgets. |
| `writeDisposition` | Yes | `preview` or `append_pipeline`; defaults are resolved by the caller. |

### JobSourcePort

```text
detect(SourceConfig) -> PortResult<AdapterDetection>
validate(SourceConfig) -> PortResult<ValidationSummary>
fetch(SourceConfig, Cursor, FetchBudget) -> PortResult<RawPostingPage>
normalize(RawPostingRef) -> PortResult<NormalizedPosting | NormalizationRejection>
health(SourceConfig) -> PortResult<JobSourceHealth>
```

The legacy configuration key `provider:` is accepted at the compatibility boundary. New contracts use `jobSourceAdapter`.

### DiscoveryResult

Contains scan identity, source summaries, accepted postings, rejected postings by stable reason code, review candidates, duplicate counts, checkpoint reference, pipeline-write result, committed side effects, and diagnostics.

## Inputs

- A shared `AgentTask` envelope with run ID, mode, language, policy, artifact references, diagnostics, and declared side effects.
- User-owned `portals.yml` or an explicit compatible source configuration.
- User-layer `TargetLanePolicy` from `config/profile.yml`, `modes/_profile.md`, and compatible portal filters.
- Existing `data/blacklist.md`, scan history, pipeline content, and deduplication state when present.
- Raw public API, RSS, JSON, HTML, or plugin payloads marked as untrusted.
- Optional checkpoint/cursor from an interrupted scan.

Missing required onboarding files produce `ONBOARDING_REQUIRED`; templates are schema examples and never active user configuration.

## Outputs

- Versioned `NormalizedPosting` records with explicit unknown values.
- `LaneDecision` records: `accepted`, `rejected`, or `needs_review`, with stable reasons.
- `FreshnessProbe` records where a source can cheaply provide them; these are not authoritative verification.
- Source health, page counts, raw/normalized/rejected/duplicate/accepted counts, elapsed time, and rate-limit metadata.
- A proposed or committed append to the canonical `## Pending` section of `data/pipeline.md` through the guarded persistence boundary.
- A checkpoint suitable for idempotent resume.
- An `AgentResult` with status `ok`, `blocked`, `needs_review`, or `retryable_failure`.

Discovery never emits an `EvaluationResult`, tracker mutation, or candidate-facing claim.

## Dependencies

- Shared domain models and result envelope defined by the runtime contract in [006-runtime.md](006-runtime.md).
- `JobSourcePort`, job-source adapters, normalization service, URL validation, and rate-limit helpers.
- Deterministic `LanePolicyPort` and user-layer policy loader.
- Artifact/pipeline persistence adapter with atomic append and deduplication support.
- Existing scanner and plugin compatibility adapters.
- Optional preliminary liveness probe from the liveness service in [005-playwright.md](005-playwright.md); no browser is required for ordinary API scans.

No dependency may import an agent, mode, or Orchestrator. DiscoveryAgent does not call another agent.

## Error Handling

| Condition | Result |
|---|---|
| Missing active source configuration | `blocked` / `ONBOARDING_REQUIRED` |
| Unknown or ambiguous adapter | `needs_review` / `JOB_SOURCE_AMBIGUOUS` |
| Unsupported or drifted source schema | `blocked` or `needs_review` / `JOB_SOURCE_SCHEMA` |
| Transient rate limit or network failure | Bounded retry, then `retryable_failure` |
| Successful response with no postings | `ok` with `empty=true`; never reported as failure |
| Source failure | Failure health status; never reported as zero jobs |
| Missing canonical URL | Quarantine record with `POSTING_URL_MISSING` |
| Uncertain target lane | `needs_review`; do not append automatically |
| Malicious external instructions | Ignore as instructions and record `UNTRUSTED_CONTENT_ANOMALY` |
| Duplicate replay | Return the prior logical result without a second pipeline entry |
| Pipeline write conflict | `retryable_failure` or `blocked` with no partial append |

Retries belong to the job-source service for transient fetches. The Orchestrator owns whole-agent retries and must respect the returned retry metadata.

## Acceptance Criteria

- Core and plugin sources produce the same `NormalizedPosting` schema.
- `TargetLanePolicy` is loaded only from user-layer configuration; shared defaults remain role-agnostic.
- Existing direct scan commands remain usable and produce compatible pipeline/history artifacts.
- Zero-LLM discovery remains available for supported sources.
- Every scan has explicit page, request, time, and concurrency limits.
- Checkpoint/resume does not duplicate accepted pipeline entries or history records.
- Empty results, policy rejection, duplicate suppression, and source failure are separately observable.
- Unknown external values remain unknown; compensation, location, sponsorship, seniority, and dates are never inferred.
- External content cannot select local paths, change policy, or trigger unrelated writes.
- A failed source cannot be summarized as “zero jobs.”

## Unit Tests

- Adapter detection for explicit legacy `provider:` and new adapter identities.
- Ambiguous adapter detection and unsupported source diagnostics.
- Normalization of complete, partial, malformed, and schema-drift fixtures.
- Explicit unknown handling for missing compensation, location, dates, and IDs.
- Lane decisions for accepted, rejected, and borderline data-role fixtures.
- Blacklist, title, location, authorization, and deduplication policy rules.
- Posting identity using requisition ID, canonical URL, and company-role fallback.
- Pagination cursor parsing, retry classification, and request-budget exhaustion.
- Empty-success versus failed-fetch classification.
- Untrusted prompt-like content and unsafe URL/path rejection.
- Content hashing and idempotency-key stability.

## Integration Tests

- Run each core adapter against local raw fixtures and append accepted results to a temporary pipeline.
- Exercise `scan.mjs`, `scan-ats-full.mjs`, and compatible local parser routes without changing their public command shapes.
- Exercise a plugin discovery fixture using the legacy hook and verify common normalization.
- Interrupt a multi-page scan, resume from its checkpoint, and assert no duplicate pipeline/history records.
- Simulate one failed source beside one empty and one successful source; verify independent health and counts.
- Run concurrent sources under bounded limits and verify deterministic merge ordering.
- Verify `data/pipeline.md` keeps the canonical `## Pending` heading and accepts documented legacy/localized input forms.
- Run `verify-pipeline.mjs` against the temporary artifacts.
