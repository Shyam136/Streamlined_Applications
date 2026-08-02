# Runtime and Local Development

## Daily Development Loop

VS Code is the only development interface. Open the repository root as the workspace, use Codex as the primary coding assistant, review all diffs in Source Control, and run commands in the integrated PowerShell terminal.

OmniRoute is not part of this loop. If later enabled, it is an optional runtime adapter and should be testable through a local interface stub.

## Local Prerequisites

- A supported Node.js version and `npm install` completed
- Playwright Chromium for browser verification and HTML-to-PDF workflows
- Git for diff/recovery workflows
- Go only when developing the optional dashboard
- Candidate user-layer files for job workflows

The current checkout cannot run `doctor.mjs` because the `js-yaml` dependency is unavailable. Install repository dependencies before treating doctor results as meaningful. Documentation generation itself must not create missing candidate profile files.

## Startup Checks

At the first interaction in a session:

```powershell
node doctor.mjs --json
node update-system.mjs check
```

`doctor.mjs` reports onboarding requirements. An available update is announced but not applied without consent. User data must remain untouched by updates.

## Compatible Entry Points

Codex may be started interactively from the root:

```powershell
codex
```

Natural-language requests map to existing modes, for example:

```text
Run the career-ops scan mode.
Evaluate this JD with career-ops auto-pipeline: <URL>
Run the career-ops tracker mode.
```

Existing Node entrypoints such as `node scan.mjs`, `node merge-tracker.mjs`, `node verify-pipeline.mjs`, and `node test-all.mjs` remain supported. The six-agent architecture must not require users to abandon these commands.

## Runtime Profiles

### Interactive

Codex coordinates one job or a small workflow, Playwright is available, and the user can approve drafts or browser filling. This is the preferred path for application work.

### Headless batch

One-shot workers may evaluate multiple postings. Reserve report numbers first, give each worker one reservation, mark fallback verification accurately, and merge tracker additions after all workers finish.

### Deterministic scripts

Scanners, tracker utilities, liveness checks, statistics, and renderers should run without an agent when their inputs are complete. Prefer this profile for CI and repeatable maintenance.

### Optional OmniRoute

OmniRoute may implement the `ExecutionPort` by accepting a versioned `AgentTask` and returning an `AgentResult`. It is not a second Orchestrator and does not choose workflow or business-policy fallbacks. It must:

- Be disabled by default.
- Implement the same run-envelope and result contracts as local execution.
- Never become the canonical store.
- Preserve local artifacts and diagnostics.
- Fail explicitly when unavailable; no silent model-backend switching for sensitive work.
- Never write canonical files or mutate the tracker directly.

## Configuration Precedence

1. Core policy and system mode files
2. `modes/_profile.md` candidate targeting overrides
3. `modes/_custom.md` procedural and output preferences
4. Invocation-specific user instructions that do not violate safety/data contracts

`config/profile.yml` supplies structured identity, location, compensation, language, and runtime preferences. `language.output` controls human-facing prose; `language.modes_dir` adds market context without changing output language.

## Run Lifecycle

```text
created -> preflight -> executing -> needs_review -> complete
                       \-> blocked
                       \-> retryable_failure
```

- `blocked` means policy/input prevents progress.
- `retryable_failure` means an operational failure can be retried without changing policy.
- `needs_review` is mandatory before external submission or factual-profile changes.
- A resumed run reads existing artifacts and avoids duplicating writes.

## Logging

Logs should be concise, structured, and local. Record stage, run ID, artifact path, job-source adapter or model backend, duration, and error code. Do not log secrets, full application answers containing sensitive data, browser storage, or hidden environment values.

Human-readable reports remain separate from operational logs. A log does not become a candidate truth source.

## Runtime Data Egress

Use precise runtime labels:

| Label | Meaning |
|---|---|
| `local-storage` | Canonical artifacts remain in the checkout |
| `zero-LLM` | No model request is made |
| `local-model` | Model inference stays on the user's machine |
| `hosted-model` | Prompt context may be sent to the configured model backend |

Local-storage does not imply local-model. Scanners using public APIs are zero-LLM but still use network access. Hosted Codex or other model backends may receive CV/JD context according to their configuration; secrets and unrelated user files must not be included.

## Concurrency and Locks

- Job-source fetches may run concurrently within rate limits.

## Scale Controls

- Bound job-source concurrency separately from model-evaluation concurrency.
- Use provider-specific pagination, DNS, and rate budgets.
- Pass evidence references and bounded excerpts rather than copying every truth file through each handoff.
- Use fingerprints and schema versions for incremental derived-index updates.
- Checkpoint large batches and merge completed tracker TSVs deterministically under the one-writer lock.
- Report numbers must be reserved atomically before fan-out.
- Tracker writes use the shared lock and atomic replacement path.
- PDF outputs use unique role/report filenames.
- Browser application sessions run sequentially unless isolation is proven.

## Error Handling

Return stable error categories such as `ONBOARDING_REQUIRED`, `OUT_OF_LANE`, `LIVENESS_UNCONFIRMED`, `TRUTH_MISSING`, `PROVIDER_SCHEMA`, `TRACKER_CONFLICT`, and `HUMAN_APPROVAL_REQUIRED`. Include a safe next action and paths involved.

Never convert a blocker into a warning solely to finish a run.

## Definition of Runtime Compatibility

A runtime change is backward compatible when:

- Existing root commands still accept their documented inputs.
- Existing modes remain routable.
- Canonical file paths and formats remain readable.
- Old reports and tracker rows remain valid or have an explicit migration.
- Optional runtime configuration can be removed without losing user data.
- Updates still preserve the user/system boundary.
