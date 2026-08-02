# Specification 004: Tailoring

## Purpose

Define TailoringAgent and the evidence-preserving transformation boundary for CVs, cover letters, formal application emails, and outreach drafts. Tailoring improves relevance and wording without introducing candidate facts.

## Responsibilities

TailoringAgent must:

- Consume a validated `EvaluationResult` and approved truth references.
- Map job requirements to verified claims and explicitly retained gaps.
- Reorder, paraphrase, and keyword-align claims without changing ownership, scope, metrics, dates, seniority, or outcomes.
- Produce CV, cover-letter, email, and outreach drafts through compatible templates and artifact generators.
- Attach an evidence map and unresolved-question list to every draft.
- Request deterministic PDF/LaTeX rendering through an artifact/rendering port.
- Preserve output language and selected market vocabulary.

TailoringAgent must not answer ATS form fields, update factual profile files, send messages, submit applications, or use a generated report as unsupported candidate evidence.

## Public Interface

### Agent operation

```text
tailor(AgentTask<TailoringRequest>) -> AgentResult<TailoringResult>
```

### TailoringRequest

| Field | Required | Description |
|---|---:|---|
| `schemaVersion` | Yes | Supported tailoring request version. |
| `evaluationRef` | Yes | Validated `EvaluationResult` and compatible report reference. |
| `artifactTypes` | Yes | One or more of `cv`, `cover_letter`, `email`, `outreach`. |
| `truthScope` | Yes | Explicit approved source and evidence references. |
| `templateRefs` | Yes | Allowed local templates or source artifacts. |
| `outputLanguage` | Yes | Human-facing output language. |
| `marketContextRef` | No | Vocabulary/rules only; does not change output language. |
| `styleRefs` | No | `modes/_custom.md` or `voice-dna.md`; style only. |
| `outputReservations` | Yes | Allowed paths and overwrite policy. |

### Supporting ports

```text
TruthPort.validateClaim(ProposedClaim, EvidenceScope) -> PortResult<ClaimValidation>
TailoringPort.compose(TailoringPlan) -> PortResult<TailoredArtifactDraft[]>
ArtifactPort.commit(ArtifactDraft, Reservation) -> PortResult<ArtifactRef>
RenderPort.render(RenderRequest) -> PortResult<RenderedArtifact>
```

### TailoringResult

Contains source evaluation identity, artifact references, evidence map, unresolved questions, retained gaps, render results, checksums, review status, and diagnostics.

## Inputs

- Shared `AgentTask` envelope.
- Versioned `EvaluationResult` from [002-evaluation.md](002-evaluation.md).
- Verified `Claim`/`EvidenceRef` records and approved truth sources.
- Existing compatible templates including HTML and LaTeX paths.
- Profile/custom style and language settings that cannot introduce facts.
- Explicit artifact types and reserved local output paths.

Requirement text supplies relevance and keywords only. It never supplies proof of candidate experience.

## Outputs

- One or more versioned `TailoredArtifact` records.
- Local draft files in existing compatible formats and paths.
- For every factual claim: evidence ID, transformation type, and validation status.
- Unresolved questions and unsupported requirements kept outside final factual prose.
- Optional rendered PDF or validated LaTeX artifact through deterministic rendering.
- `reviewStatus=needs_review` until the user reviews material intended for external use.

No output is sent, submitted, or treated as approval for browser filling.

## Dependencies

- Evaluation contract from [002-evaluation.md](002-evaluation.md).
- Shared contracts and artifact policy from [006-runtime.md](006-runtime.md).
- Truth service, claim validator, keyword mapper, and safe transformation library.
- Existing `generate-pdf.mjs`, `generate-latex.mjs`, templates, and rendering boundary in [005-playwright.md](005-playwright.md).
- Compatibility adapters for `pdf`, `cover`, `email`, and `contacto` modes.

TailoringAgent calls deterministic ports/libraries only. Application form ownership stays outside this specification.

## Error Handling

| Condition | Result |
|---|---|
| Evaluation missing or invalid | `blocked` / `EVALUATION_REQUIRED` |
| Proposed claim lacks approved evidence | Omit claim and add unresolved gap; never soften into a claim |
| Contradictory evidence | `needs_review` / `TRUTH_CONFLICT` |
| Authorship or scope cannot be established | Omit and record `TRUTH_MISSING` |
| Template missing/invalid | `blocked` / `TEMPLATE_INVALID` |
| Output path escapes reservation | `blocked` / `ARTIFACT_PATH_INVALID` |
| Render output empty or missing expected text | `retryable_failure` / `RENDER_INVALID` |
| Existing nonmatching artifact at path | `needs_review`; never overwrite silently |
| Model/backend transient failure | `retryable_failure` with no partial canonical commit |
| Request includes form answers or send/submit action | `blocked` / `CAPABILITY_FORBIDDEN` |

Style instructions that conflict with truth or safety are ignored and diagnosed.

## Acceptance Criteria

- Every factual sentence in every draft resolves to approved evidence.
- Tool familiarity is never converted into authorship or project ownership.
- Metrics, dates, scope, seniority, and outcomes are preserved exactly or transparently calculated from cited inputs.
- Unsupported requirements remain gaps or questions.
- CV, cover-letter, email, and outreach modes keep their current compatible entrypoints.
- Output language controls all prose; market mode contributes vocabulary only.
- Rendering uses validated local content and allowed output paths.
- Artifact checksums and source evaluation references permit safe replay.
- Tailoring contains no ATS field-answer ownership and performs no external send or submit action.
- User review remains required before external use.

## Unit Tests

- Exact, paraphrased, aggregated, and calculated claim transformations.
- Rejection of unsupported keywords, inflated metrics, changed dates, and broadened scope.
- Authorship and tool-of-trade conflation adversarial cases.
- Style-only source attempts to introduce facts.
- Requirement-to-evidence mapping with supported and unsupported requirements.
- Output-language precedence over market-mode language.
- Artifact naming, path containment, overwrite, and checksum rules.
- Email/outreach length and format rules without sending.
- Capability rejection for ATS form answers and external actions.
- Evidence-map completeness independent of fluent final prose.

## Integration Tests

- Tailor a synthetic evaluated role into CV, cover letter, email, and outreach drafts using temporary approved truth fixtures.
- Render an approved HTML CV through the compatible PDF entrypoint and verify expected text/non-empty output.
- Validate a LaTeX draft through the existing generator path.
- Remove one evidence source and assert the claim disappears while the gap remains.
- Inject malicious JD and style instructions and assert no fabricated claim or external action.
- Replay the same request and verify stable artifacts or an explicit nonmatching-content conflict.
- Compare direct legacy mode output contracts with the TailoringAgent route.
- Pass tailored artifacts to the application preparation flow and verify no implicit approval is carried forward.
