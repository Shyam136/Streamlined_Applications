# Specification 005: Playwright Boundary

## Purpose

Define the deterministic Playwright services used for authoritative posting verification, rendered extraction, PDF generation, and application-form assistance. Playwright is a bounded library capability, not an agent.

## Responsibilities

The Playwright boundary must:

- Verify rendered job pages as `active`, `expired`, or `unconfirmed` with concise evidence.
- Extract semantic job and application content when public APIs are insufficient.
- Render already-approved HTML documents to PDF deterministically.
- Extract application-field models and optionally fill reversible fields after recorded approval.
- Enforce domain allowlists, path constraints, timeouts, isolation, cleanup, and secret redaction.
- Detect and refuse every final external action.

It must not make lane, scoring, truth, recommendation, or orchestration decisions; bypass authentication/CAPTCHA; infer sensitive answers; or click Submit, Send, Apply, Finish, Complete Application, or an ambiguous equivalent.

## Public Interface

### Liveness operations

```text
probe(PostingRef) -> PortResult<FreshnessProbe>
verify(PostingRef, BrowserPolicy) -> PortResult<VerificationResult>
```

`FreshnessProbe.status` is `active | expired | unknown` and may come from a cheap API check. `VerificationResult.status` is `active | expired | unconfirmed` and is authoritative for interactive workflows.

### Extraction and rendering

```text
extractPosting(PageRef, ExtractionPolicy) -> PortResult<RenderedPosting>
extractApplicationForm(PageRef, ExtractionPolicy) -> PortResult<ApplicationFormModel>
renderPdf(RenderRequest) -> PortResult<RenderedArtifact>
```

### Reversible application assistance

```text
prepareFill(ApplicationFormModel, VerifiedValueMap) -> PortResult<FillPlan>
fillReversible(FillPlan, ApprovalRef) -> PortResult<FillResult>
```

No public interface exposes a final-submit operation.

### Core result requirements

All results carry `schemaVersion`, source URL, method, timestamp, concise evidence/diagnostics, retryability, and redacted artifact references. `ApplicationDraft.humanSubmitRequired` is always true and cannot be overridden.

## Inputs

- Canonical HTTPS posting/application URL and allowlisted redirect policy.
- Isolated browser-context policy, timeouts, locale, and supported Chromium configuration.
- For rendering: approved local HTML/template input, allowed output reservation, page/margin/background settings, and expected text assertions.
- For form assistance: extracted field model, verified structured values/evidence, and explicit approval reference for the exact reversible fill plan.
- Optional local authenticated profile only after explicit user opt-in; its path is never a committed artifact.

## Outputs

- `FreshnessProbe` or authoritative `VerificationResult` with bounded evidence.
- Semantic rendered posting or application form models with stable field labels and source URL.
- Validated local PDF artifact with path, checksum, size, page/text checks, and diagnostics.
- Proposed `FillPlan` and optional `FillResult` for reversible fields only.
- `needs_review` handoff for login, CAPTCHA, legal/consent, demographic, sponsorship, salary, identity, file upload, ambiguous, or final-action fields.

Browser cookies, tokens, storage, passwords, autofill secrets, and full sensitive answers are never outputs.

## Dependencies

- Shared contracts and result envelope from [006-runtime.md](006-runtime.md).
- Repository-supported Playwright/Chromium version and existing `generate-pdf.mjs` compatibility adapter.
- URL/domain policy, artifact/path service, redaction, and structured diagnostics.
- Truth service for verified form values; the browser boundary does not resolve claims itself.
- ApplicationAgent as the caller for form workflows and EvaluationAgent as the caller for verification; neither is imported by the library.

Normal unit and integration tests depend only on local fixtures. Live-site tests are opt-in and non-blocking.

## Error Handling

| Condition | Result |
|---|---|
| Navigation timeout/network challenge | Bounded retry, then `unconfirmed` or `retryable_failure` as appropriate |
| Explicit expired/removed/filled signal | `ok` with verification status `expired` |
| Only chrome/no recognizable JD | `ok` with status `expired` when terminal evidence is sufficient; otherwise `unconfirmed` |
| Conflicting expiry and generic Apply text | Expiry wins |
| Unexpected redirect/domain | `blocked` unless allowlisted or explicitly confirmed |
| Selector/schema drift | `needs_review` with safe diagnostic and optional redacted fixture artifact |
| Login or CAPTCHA | `needs_review`; hand control to user |
| Sensitive/legal/consent field | Leave unresolved and require explicit user action |
| Ambiguous or final action | Refuse operation and return `HUMAN_APPROVAL_REQUIRED` |
| PDF empty/missing expected text | `retryable_failure`; do not mark complete |
| Output path escape | `blocked` / `ARTIFACT_PATH_INVALID` |
| Cleanup failure | Redacted diagnostic; attempt deterministic resource closure |

Legacy `closed` maps to `expired`; legacy `uncertain` maps to `unconfirmed` only at compatibility boundaries.

## Acceptance Criteria

- Interactive liveness verification uses rendered content and canonical verdicts.
- Preliminary probes and authoritative verification remain different models and operations.
- Expiry evidence takes precedence over generic Apply text.
- Every browser context is isolated by default and closed on success/failure paths.
- External page text cannot change local policy or issue tool instructions.
- PDF rendering consumes approved local content only and validates the resulting artifact.
- Form extraction prefers semantic/accessibility data over brittle selectors.
- No public or internal callable capability can perform final submission.
- Ambiguous controls are treated as final-action boundaries.
- Secrets and browser state never enter logs, reports, or canonical artifacts.

## Unit Tests

- Page classifiers for active, expired, unconfirmed, conflicting, and chrome-only fixtures.
- Legacy verdict mapping.
- Semantic field normalization across text, select, checkbox, radio, upload, and multi-step controls.
- Final-action classifier across accessible names, button types, form actions, and ambiguous controls.
- Domain redirect and URL-scheme validation.
- Fill-plan classification into reversible, unresolved, sensitive, and forbidden actions.
- Redaction of cookies, tokens, passwords, and sensitive field values.
- PDF request path, option, and expected-text validation.
- Timeout/retry classification and cleanup execution.

## Integration Tests

- Use a local HTTP server for active, expired, ambiguous, redirected, login-wall, and challenge pages.
- Verify context/page/browser cleanup after navigation, extraction, fill, and render failures.
- Exercise a multi-step local form and assert every final-submit event listener remains untouched.
- Test file-upload and legal/demographic fields remain unresolved for user action.
- Render a synthetic approved HTML document and verify non-empty PDF text/page count.
- Reject a render path outside the reserved temporary output directory.
- Compare interactive authoritative verification with a separate preliminary probe fixture.
- Run compatibility through `generate-pdf.mjs` and current apply preparation without changing their public entrypoints.
- Keep an opt-in live-site smoke test isolated from required CI.
