# Tracker Architecture

## Source of Truth

`data/applications.md` is the canonical application tracker. It is human-readable, Git-diffable, and consumed across the career-ops ecosystem. Any SQLite representation is a derived index that must be rebuildable from files.

This is permanent doctrine: there is no planned database-primary mode. A run manifest or index may reference tracker artifacts but can never be required to interpret them.

This checkout does not currently contain `data/applications.md`. Runtime must create it only through onboarding or the established tracker setup flow, not infer historical applications.

## Canonical Table

The expected columns are:

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
```

Optional compatible fields such as `Via` are introduced only through supported migration commands.

## New Rows

Never add a new application by hand-editing the canonical table. Write one line per evaluation to:

```text
batch/tracker-additions/{num}-{company-slug}.tsv
```

The TSV order is:

```text
num, date, company, role, status, score, pdf, report, notes
```

Status precedes score in the TSV even though score precedes status in the Markdown tracker. `merge-tracker.mjs` performs the swap and link normalization.

Example shape:

```text
042\t2026-08-02\tExample Co\tData Platform Engineer\tEvaluated\t4.3/5\t✅\t[042](reports/042-example-co-2026-08-02.md)\tReq JR-10423
```

Use `N/A`, `—`, or `-` for a backfilled row without an evaluation score. Do not use an empty or novel placeholder.

New output uses one decimal (`X.X/5`). Existing parsers may accept integer or multi-decimal numeric scores and the historical `DUP` marker for read compatibility; new writers must not emit `DUP` as a no-score sentinel.

## Existing Rows

Update state and notes through:

```powershell
node set-status.mjs <report-number-or-company> <State> --note "<note>"
```

The command is the canonical locked, validated, atomic write path. A report-link mismatch or ambiguous selector must stop the operation.

## Canonical States

`templates/states.yml` is authoritative.

| State | Meaning |
|---|---|
| `Evaluated` | Evaluation finished; decision pending |
| `Applied` | Human submitted the application |
| `Responded` | Employer responded |
| `Interview` | Interview process active |
| `Offer` | Offer received |
| `Hired` | Offer accepted; terminal success |
| `Rejected` | Employer rejected the application |
| `Discarded` | Candidate declined or posting closed |
| `SKIP` | Deliberate non-application |

Dates and commentary belong in their columns, never in `Status`.

## Identity and Deduplication

Primary identity uses report number and source posting identity. Company plus normalized role is the compatibility fallback. For similar roles at one company, include recognizable requisition/posting IDs in Notes on both rows, such as `req JR-10423` or `job id 88214`.

An application through an agency uses a tagged extra field such as `via=Hays`. Unknown end employer uses `?` as Company plus an explanatory note.

## TrackerAgent Contract

TrackerAgent accepts declarative commands:

- `add_evaluation` with a validated report and TSV payload
- `transition` with selector, target canonical state, and optional note
- `reconcile` for reports/pipeline/tracker consistency
- `verify` for read-only health diagnostics

It calls existing tracker libraries/scripts and returns the previous state, new state, paths changed, and validation result. It does not directly rewrite Markdown.

The planned command and result records carry `schemaVersion`, run/idempotency identity, expected prior state, diagnostics, and requested versus committed side effects. Until those records are implemented, the current script CLI and file formats remain authoritative.

## Batch Workflow

1. Reserve report numbers.
2. Give each evaluator one reservation.
3. Write one report and one TSV addition per completed evaluation.
4. Run `node merge-tracker.mjs` once after the batch.
5. Run `node verify-pipeline.mjs`.
6. Preserve rejected TSVs for diagnosis; do not bypass the merge guard.

## Atomicity and Recovery

Tracker mutations use a shared lock, parse the current file, validate intent, write a temporary file, and atomically replace the target. A crash before replacement must leave the original intact. Retrying the same command must be idempotent.

If tracker health fails:

- Run verification and inspect exact diagnostics.
- Normalize states through the supported command.
- Deduplicate through `dedup-tracker.mjs` only after review.
- Re-run merge migrations for link/column normalization when documented.
- Never repair by deleting unexplained rows.

## Practical Validation Checklist

- Number is reserved and unique.
- Date is `YYYY-MM-DD`.
- Company and role are non-empty.
- Data-lane role gate passed or status is `SKIP` with reason.
- Score format is `X.X/5` or an approved sentinel.
- Status is canonical.
- Report link points to the matching report number.
- URL and legitimacy headers exist in the report.
- Notes include a requisition ID when needed for disambiguation.
- No existing company-role/posting identity conflicts.

## Compatibility Matrix

| Concern | Canonical output | Read compatibility |
|---|---|---|
| Score | `X.X/5` | Any numeric precision accepted by the current parser |
| No score | `N/A`, `—`, or `-` | Historical `DUP` may be read but is not emitted |
| Pipeline inbox heading | `## Pending` | Localized legacy headings may be handled by their market mode |
| Tracker states | English values from `templates/states.yml` | Localized aliases normalize to canonical states |
| New row | TSV addition plus `merge-tracker.mjs` | Existing valid rows remain readable |
| Existing row | `set-status.mjs` | Explicit repair/migration tools only; no routine hand edits |
| Index | Derived SQLite | Safe to delete and rebuild from Markdown |
