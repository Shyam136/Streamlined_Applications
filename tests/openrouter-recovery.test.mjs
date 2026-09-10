import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { pass, fail } from './helpers.mjs';
import { findCommittedEvaluation, recoverCommittedEvaluation } from '../openrouter-runner.mjs';

console.log('\nOpenRouter pipeline — committed evaluation recovery');
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(`${message}${detail ? `: ${detail}` : ''}`);
const root = mkdtempSync(path.join(tmpdir(), 'career-ops-openrouter-recovery-'));

try {
  mkdirSync(path.join(root, 'reports'), { recursive: true });
  mkdirSync(path.join(root, 'data'), { recursive: true });
  const url = 'https://jobs.example.test/acme/123';
  writeFileSync(path.join(root, 'reports', '007-acme-2026-09-10.md'), `# Evaluation: Acme - Platform Engineer\n\n**URL:** ${url}\n\n**Score:** 4.4/5\n`);
  expect(findCommittedEvaluation(url, root)?.relPath === 'reports/007-acme-2026-09-10.md', 'finds a report committed before the pipeline checkpoint');
  expect(findCommittedEvaluation(`${url}4`, root) === null, 'does not recover a different URL by prefix');

  const recovered = recoverCommittedEvaluation(url, { company: 'Acme', role: 'Platform Engineer' }, root);
  const staged = path.join(root, 'batch', 'tracker-additions', 'or-007-acme.tsv');
  expect(recovered && existsSync(staged), 'reconstructs a missing tracker addition from the committed report');
  const first = readFileSync(staged, 'utf-8');
  recoverCommittedEvaluation(url, { company: 'Acme', role: 'Platform Engineer' }, root);
  expect(readFileSync(staged, 'utf-8') === first, 'replay is byte-stable and does not append duplicate tracker intents');

  writeFileSync(path.join(root, 'data', 'applications.md'), `| # | Date | Company | Role | Status | Score | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n| 7 | 2026-09-10 | Acme | Platform Engineer | Evaluated | 4.4/5 | ❌ | [007](reports/007-acme-2026-09-10.md) | |\n`);
  unlinkSync(staged);
  recoverCommittedEvaluation(url, { company: 'Acme', role: 'Platform Engineer' }, root);
  expect(!existsSync(staged), 'does not restage an evaluation already present in the canonical tracker');
} catch (error) {
  fail(`OpenRouter recovery tests crashed: ${error?.stack || error}`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
