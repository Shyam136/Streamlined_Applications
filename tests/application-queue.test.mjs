import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { pass, fail } from './helpers.mjs';
import { buildApplicationQueue, loadVerifiedApplicationValues } from '../lib/application-queue.mjs';

console.log('\nApplication queue — canonical tracker/report/PDF join');
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(`${message}${detail ? `: ${detail}` : ''}`);
const root = mkdtempSync(path.join(tmpdir(), 'career-ops-application-queue-'));
try {
  for (const dir of ['data', 'reports', 'output', 'config']) mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, 'data', 'applications.md'), [
    '# Applications Tracker', '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 1 | 2026-09-10 | Acme | Data Engineer | 4.6/5 | Evaluated | ✅ | [7](../reports/007-acme.md) | |',
    '| 2 | 2026-09-10 | Low | Analyst | 3.1/5 | Evaluated | ✅ | [8](../reports/008-low.md) | |',
    '| 3 | 2026-09-10 | Done | Engineer | 5.0/5 | Applied | ✅ | [9](../reports/009-done.md) | |',
    '| 4 | 2026-09-11 | Fresh | ML Engineer | 4.4/5 | Evaluated | ✅ | [10](../reports/010-fresh.md) | |',
    '| 5 | 2026-09-12 | Undated | Data Scientist | 4.5/5 | Evaluated | ✅ | [11](../reports/011-undated.md) | |',
  ].join('\n'));
  writeFileSync(path.join(root, 'reports', '007-acme.md'), '**URL:** https://jobs.example.test/acme/7\n');
  writeFileSync(path.join(root, 'reports', '008-low.md'), '**URL:** https://jobs.example.test/low/8\n');
  writeFileSync(path.join(root, 'reports', '009-done.md'), '**URL:** https://jobs.example.test/done/9\n');
  writeFileSync(path.join(root, 'reports', '010-fresh.md'), '**URL:** https://jobs.example.test/fresh/10/application\n');
  writeFileSync(path.join(root, 'reports', '011-undated.md'), '**URL:** https://jobs.example.test/undated/11\n');
  for (const n of ['7', '8', '9', '10', '11']) writeFileSync(path.join(root, 'output', `${n}.pdf`), 'pdf');
  writeFileSync(path.join(root, 'data', 'pdf-index.tsv'), '# report\tpdf\thtml\tformat\tdate\n7\toutput/7.pdf\t\tletter\t2026-09-10\n8\toutput/8.pdf\t\tletter\t2026-09-10\n9\toutput/9.pdf\t\tletter\t2026-09-10\n10\toutput/10.pdf\t\tletter\t2026-09-11\n11\toutput/11.pdf\t\tletter\t2026-09-12\n');
  writeFileSync(path.join(root, 'data', 'scan-history.tsv'), 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\tfingerprint\tposted_at\nhttps://jobs.example.test/acme/7\t2026-09-10\ttest\tData Engineer\tAcme\tadded\tRemote\t\t2026-09-01\nhttps://jobs.example.test/fresh/10\t2026-09-11\ttest\tML Engineer\tFresh\tadded\tRemote\t\t2026-09-11\n');
  const queue = buildApplicationQueue({ root, minScore: 4 });
  expect(queue.length === 3 && queue.map((item) => item.company).join(',') === 'Fresh,Acme,Undated', 'queues eligible rows newest published first, then older published, then undated fallback');
  writeFileSync(path.join(root, 'config', 'profile.yml'), 'candidate:\n  full_name: Jane Q Smith\n  email: jane@example.test\n  phone: "+1 555 0100"\n  linkedin: https://linkedin.com/in/jane\napplication_answers:\n  fields:\n    sponsorship: No\n');
  const values = loadVerifiedApplicationValues(root);
  expect(values.firstName === 'Jane' && values.lastName === 'Q Smith' && values.fields.sponsorship === 'No', 'loads only explicit profile and application-answer values');
} catch (error) {
  fail(`application queue tests crashed: ${error?.stack || error}`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
