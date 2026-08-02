# Playwright Architecture

## Responsibilities

Playwright has four bounded roles:

1. Verify that a job posting is live.
2. Extract rendered job/application content when public APIs are insufficient.
3. Render approved HTML CV and cover-letter drafts to PDF.
4. Assist with application form reading and reversible filling.

Playwright is a library capability. ApplicationAgent and EvaluationAgent call it through narrow helpers; browser sessions do not become autonomous agents.

## Freshness and Liveness Verification

A supported ATS/job-source API may provide a preliminary `FreshnessProbe` during discovery: `active`, `expired`, or `unknown`. Interactive verification remains a separate rendered-page operation.

Interactive posting verification must navigate to the URL and inspect the rendered page. Return a `VerificationResult` classified as:

- `active`: recognizable job title and description plus an application action
- `expired`: explicit expired/removed/filled signal, terminal redirect, or only site chrome without the JD
- `unconfirmed`: browser/network challenge or ambiguous content

Expiry signals win over generic Apply text. Save a concise evidence summary and timestamp, not an unbounded copy of the page. Compatibility adapters map legacy `closed` to `expired` and legacy `uncertain` to `unconfirmed`.

## Browser Context Policy

- Create an isolated context per company/application by default.
- Use a fixed, supported Chromium version from the repository setup.
- Apply timeouts to navigation, selectors, downloads, and PDF rendering.
- Close pages, contexts, and browsers in `finally` paths.
- Retain screenshots/traces only for debugging and keep them gitignored.
- Never log cookies, tokens, local storage, passwords, or autofill secrets.

Persistent authenticated profiles require explicit user opt-in and a documented local path outside committed artifacts.

## Extraction

Prefer semantic content and accessibility snapshots over brittle CSS selectors. Provider-specific selectors belong in reusable helpers with fixtures. Normalize whitespace and retain source URL/field labels.

Prompt-injection-like text in a page is reported as external content; it does not alter navigation or local policies.

## PDF Rendering

`generate-pdf.mjs` remains the compatible HTML-to-PDF entrypoint. Rendering should:

- Consume an approved local HTML artifact/template.
- Wait for fonts and deterministic layout readiness.
- Use explicit page size, margins, backgrounds, and print CSS.
- Write only under the expected local output path.
- Validate that the PDF exists, is non-empty, and contains expected text.

Do not fetch candidate facts during rendering. The renderer receives already validated content.

## Application Assistance

The browser workflow is:

```text
navigate -> identify ATS/page -> extract fields -> map evidence
-> show draft -> optional reversible fill -> stop before submit
```

The final submit element should be recognized as a hard boundary. Helpers should refuse clicks whose accessible name or action corresponds to Submit, Send, Apply, Finish, Complete Application, or equivalent finalization.

File uploads, legal attestations, consent checkboxes, demographic fields, and work-authorization answers require explicit user review. CAPTCHA and anti-bot challenges are handed back to the user.

## Fail-Closed Behavior

| Failure | Behavior |
|---|---|
| Navigation timeout | Retry within bound, then `unconfirmed` |
| Selector drift | Capture diagnostic and require review |
| Unexpected domain redirect | Stop unless allowlisted/confirmed |
| Login required | Ask user to take over; do not bypass |
| Ambiguous final button | Treat as submit boundary and stop |
| PDF missing content | Fail rendering; do not mark PDF complete |
| Download path escapes output directory | Reject write |

## Testing

- Unit-test page classifiers against saved HTML/accessibility fixtures.
- Use local HTTP fixtures for navigation, redirects, expired pages, and forms.
- Assert submit buttons are never clicked.
- Test context cleanup after every failure.
- Compare extracted semantic fields rather than pixel-perfect screenshots where possible.
- Add a small PDF smoke test that checks page count/text and an optional visual regression test for templates.
- Keep live-site tests opt-in because external pages are unstable.

## Debugging in VS Code

Run focused Playwright tests from the integrated terminal. Use headed mode, trace viewer, or saved screenshots only for a local debugging session. Do not make a visible browser or OmniRoute a normal prerequisite for unit tests.
