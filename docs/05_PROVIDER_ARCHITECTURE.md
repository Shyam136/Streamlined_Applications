# Job-Source Adapter Architecture

## Purpose

Job-source adapters turn external job sources into a normalized posting stream. They are libraries used by DiscoveryAgent, not agents themselves. Core adapters use open, no-auth sources; authenticated integrations belong in opt-in plugins.

Existing configuration and plugin manifests retain the literal `provider:` field/hook for backward compatibility. In architecture prose and new interfaces, **job-source adapter** means an ATS/job-board integration, while **model backend** means an LLM endpoint or vendor.

## Current Compatibility Surface

`scan.mjs` and `providers/` remain the scanning entrypoint and adapter home. `portals.yml` remains user-owned configuration. Existing Greenhouse, Lever, Ashby, Workday, BambooHR, Teamtailor, Breezy, RSS, JSON, and board-specific behavior should continue to work.

Because `portals.yml` is absent in this checkout, discovery should report onboarding required. `templates/portals.example.yml` is a schema/example source, not active user configuration.

## Job-Source Interface

A job-source adapter should expose equivalent operations:

```text
detect(sourceConfig) -> confidence/capability
validate(sourceConfig) -> diagnostics
fetch(cursor, context) -> raw page + next cursor
normalize(raw item) -> normalized job or rejection
health() -> job-source availability metadata
```

The exact code signature may follow existing conventions. The important rule is that fetching and normalization remain separate so raw fixtures can test parsing without network access.

## Normalized Posting Record

All core adapters and plugin discovery hooks normalize to the same versioned `NormalizedPosting`. Minimum fields:

- Job-source adapter name and source name
- Company and title
- Canonical posting URL
- Posting/requisition ID when present
- Location and remote/hybrid/on-site signal
- Employment type
- Published/updated date when explicitly supplied
- Compensation when explicitly supplied, including currency and period
- Raw description or a stable raw reference
- Discovery timestamp
- Normalization version
- Diagnostics and missing fields

Do not infer compensation, location, sponsorship, seniority, or publication dates when the source omits them.

## Data-Lane Gate

The normalized title and description pass through a deterministic-first lane classifier configured by the user's `TargetLanePolicy`. For this checkout, positive families include data engineering, analytics engineering, BI engineering, data platform/infrastructure, data architecture, governance, quality, observability, warehousing, lakehouse, and streaming. These families are not shared career-ops defaults.

Use negative reason codes for unrelated roles. Borderline leadership or ML-platform roles require review when the primary mandate is unclear. Keep the keywords configurable in user-layer files when implementation begins; do not embed candidate targeting in updateable shared modes.

## Detection and Routing

Prefer explicit legacy `provider:` configuration. Otherwise detect from stable host/path patterns or source metadata. If multiple adapters claim a source, choose only when one has a clear confidence lead; otherwise block with `JOB_SOURCE_AMBIGUOUS`.

Fallback order:

1. Supported public API
2. Supported public RSS/JSON feed
3. Browser-backed extraction where policy permits
4. Manual/pipeline review

Do not silently substitute web search for mandatory liveness verification.

## Reliability

- Apply bounded retries with jitter only to transient failures.
- Respect rate limits and job-source terms.
- Checkpoint large scans and support resume.
- Preserve raw IDs and cursors.
- Deduplicate before writing pipeline candidates.
- Record job-source health separately from “no matching jobs.”

An empty successful response and a failed fetch are different outcomes.

## Security

External payloads are untrusted. Parse data fields; never execute embedded markup, scripts, prompt text, or links. Cap payload sizes, validate URL schemes, sanitize diagnostics, and prevent job-source output from selecting local write paths.

Plugins are disabled by default. A plugin may use only its declared hooks and cannot edit core policy, reveal secrets, submit applications, or promote itself into a core job-source adapter.

## Model Backends and OmniRoute

OmniRoute is not a job-source adapter. If enabled, it implements only the execution port for an agent task and may use a configured model backend. Job-source fetch, raw artifacts, deduplication, policy, and canonical writes remain local and must work without it.

## Adding a Job-Source Adapter

1. Confirm the source is public/no-auth or place it in a plugin.
2. Add an adapter following existing `providers/` conventions.
3. Add raw fixtures for success, empty, pagination, malformed, rate-limited, and schema-change responses.
4. Normalize into the shared job record without guesses.
5. Register detection explicitly.
6. Add configuration documentation and a disabled-by-default example when appropriate.
7. Run job-source adapter tests, scanner tests, dedup tests, and the full suite.
8. Verify the new system path is covered by updater allowlists/tests.

## Observability

Per scan, record job-source adapter, pages requested, raw items, normalized items, rejected items by reason, duplicates, accepted lane matches, elapsed time, and failure class. Append compatible aggregate counters to existing scan-run/history files rather than creating a competing canonical store.
