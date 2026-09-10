import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { pass, fail } from './helpers.mjs';
import { inspectTailoringQueue } from '../lib/tailoring-queue.mjs';

console.log('\nTailoring queue — evaluation artifact handoff');
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(`${message}${detail ? `: ${detail}` : ''}`);
const root = mkdtempSync(path.join(tmpdir(), 'career-ops-tailoring-queue-'));

try {
  mkdirSync(path.join(root, 'data'), { recursive: true });
  mkdirSync(path.join(root, 'reports'), { recursive: true });
  mkdirSync(path.join(root, 'jds'), { recursive: true });
  mkdirSync(path.join(root, 'output'), { recursive: true });
  writeFileSync(path.join(root, 'data', 'applications.md'), `# Applications\n\n| # | Date | Company | Role | Status | Score | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n| 7 | 2026-09-10 | Acme | Engineer | Evaluated | 4.5/5 | ❌ | [007](reports/007-acme-2026-09-10.md) | |\n| 8 | 2026-09-10 | Beta | Analyst | Evaluated | 4.2/5 | ❌ | [008](reports/008-beta-2026-09-10.md) | |\n| 9 | 2026-09-10 | Done | Engineer | Evaluated | 4.8/5 | ✅ | [009](reports/009-done-2026-09-10.md) | |\n`);
  writeFileSync(path.join(root, 'reports', '007-acme-2026-09-10.md'), '# Evaluation: Acme - Engineer\n\n**JD:** jds/007-acme-2026-09-10.md\n');
  writeFileSync(path.join(root, 'jds', '007-acme-2026-09-10.md'), '# Job description\n');
  writeFileSync(path.join(root, 'reports', '008-beta-2026-09-10.md'), '# Evaluation: Beta - Analyst\n');
  writeFileSync(path.join(root, 'reports', '009-done-2026-09-10.md'), '**JD:** jds/009-done-2026-09-10.md\n');
  writeFileSync(path.join(root, 'data', 'pdf-index.tsv'), '# report\tpdf\thtml\tformat\tdate\n9\toutput/9.pdf\toutput/9.html\tletter\t2026-09-10\n');
  writeFileSync(path.join(root, 'output', '9.pdf'), 'pdf');

  const queue = inspectTailoringQueue({ root, minScore: 4 });
  expect(queue.ready.length === 1 && queue.ready[0].reportNum === '7', 'queues an evaluated report with its archived JD');
  expect(queue.blocked.length === 1 && queue.blocked[0].reportNum === '8', 'reports a high-score row whose JD was not archived');
  expect(!queue.ready.some((item) => item.reportNum === '9'), 'skips reports that already have a generated PDF');

  writeFileSync(path.join(root, 'reports', '007-acme-2026-09-10.md'), '**JD:** ../outside.md\n');
  const escaped = inspectTailoringQueue({ root, minScore: 4 });
  expect(escaped.blocked.some((item) => item.reportNum === '7'), 'rejects archived-JD paths outside the workspace');
} catch (error) {
  fail(`tailoring queue tests crashed: ${error?.stack || error}`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
