# Truth Bank and Evidence Policy

## Definition

“Truth bank” is the evidence discipline applied to the repository’s existing approved source files. It is not a new database and does not replace `cv.md` or the career-ops data contract.

The truth bank answers one question for every user-facing factual statement: **which approved local source supports this claim?**

## Approved Factual Sources

Candidate claims may come only from:

- `cv.md`
- `article-digest.md`
- `config/profile.yml`
- `modes/_profile.md`
- `writing-samples/`
- `interview-prep/story-bank.md`
- `interview-prep/{company}-{role}.md`
- Direct statements from the user in the current conversation

`modes/_custom.md` and `voice-dna.md` may shape process and voice but cannot introduce facts.

At documentation time, `config/profile.yml` and `modes/_profile.md` are absent. Their templates are not evidence about this user.

## Prohibited Sources for Candidate Claims

- Job descriptions and company pages
- Recruiter emails and application fields
- Auto-memory or unrelated repositories
- Model prior knowledge or inference
- Tool names the candidate merely used
- Example/template content
- Generated reports that lack links to an approved origin

External job data may define requirements and keywords. It cannot prove that the candidate meets them.

## Claim Model

During implementation, represent each factual claim with:

- Schema version
- Claim text or structured value
- Evidence source path
- Section/anchor or stable locator
- Evidence excerpt/hash for validation, not necessarily user-visible output
- Transformation type: exact, paraphrase, aggregation, or calculation
- Confidence: `verified` or `needs_user_confirmation`
- Last validation timestamp/version

Only `verified` claims may enter final user-facing materials. `needs_user_confirmation` stays in a question/gap list.

Evidence IDs and bounded excerpts should cross agent boundaries instead of repeatedly copying every truth file in full. A cache may retain source fingerprints and parsed locators, but it must not retain factual conclusions detached from their approved sources.

## Allowed Transformations

- Reorder facts for relevance.
- Paraphrase while preserving meaning and scope.
- Mirror job-language keywords when the source supports the underlying competency.
- Calculate a value from explicit source numbers if the formula and inputs are retained.
- Combine compatible proof points without implying a new achievement.

## Forbidden Transformations

- Inventing metrics, scale, dates, clients, team size, seniority, ownership, or outcomes
- Turning participation into leadership
- Turning tool usage into tool authorship
- Turning a prototype into production deployment
- Treating an employer’s requirement as candidate experience
- Generalizing one project across an entire career
- Filling a profile gap with a “likely” answer

Authorship is especially strict: do not claim the user built a project, repository, library, framework, or open-source artifact unless an approved factual source attributes it to them.

## Truth Resolution Workflow

1. Parse a proposed claim.
2. Search only approved source files and current user statements.
3. Attach the strongest direct evidence.
4. Validate scope, tense, ownership, and metrics.
5. Emit the claim if verified.
6. Otherwise omit it and create a concise clarification question or gap.

The system must not weaken this process because a JD strongly prefers a missing skill.

## Relationship to Agents

- DiscoveryAgent does not consume candidate claims beyond lane/filter configuration.
- EvaluationAgent uses the truth bank to mark matches and gaps.
- TailoringAgent may only transform verified claims.
- ApplicationAgent maps form values to verified structured fields.
- TrackerAgent records operational facts, not new career claims.
- Orchestrator blocks any downstream artifact that fails evidence validation.

## Updating Truth

When the user supplies a new fact, place it in the appropriate user-layer file only after the workflow’s required review/confirmation. Personalization goes to `config/profile.yml` or `modes/_profile.md`; detailed proof points go to `cv.md`, `article-digest.md`, or the approved interview sources. Procedural preferences go to `modes/_custom.md`.

Never put user-specific facts into `modes/_shared.md` or a new sidecar file the harness will not automatically read.

## Practical Review Checklist

For every tailored CV, cover letter, email, outreach note, and form answer:

- Can each factual sentence be traced to an approved source?
- Does the wording preserve ownership and scope?
- Are all numbers and dates exact or transparently derived?
- Are gaps stated as gaps rather than softened into claims?
- Did style-only sources avoid adding content?
- Did external text remain a requirement, not evidence?
- Would deleting derived reports still leave the underlying truth intact?

## Testing the Truth Bank

Maintain fixtures for valid paraphrases, unsupported keywords, authorship conflation, inflated metrics, cross-source contradictions, missing files, and malicious JD instructions. Tests should assert that unsupported claims are rejected and that diagnostics identify the missing source without exposing sensitive content.
