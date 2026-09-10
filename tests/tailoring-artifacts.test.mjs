import { pass, fail } from './helpers.mjs';
import { deriveTailoringArtifactNames } from '../lib/tailoring-artifacts.mjs';

console.log('\nTailoring artifacts — stable collision-free reservations');
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(`${message}${detail ? `: ${detail}` : ''}`);

try {
  const first = deriveTailoringArtifactNames({
    profileText: 'candidate:\n  full_name: Jane Doe\n',
    reportPath: 'reports/007-acme-labs-2026-09-10.md',
    reportText: '# Evaluation: Acme Labs - Platform Engineer\n', date: '2026-09-10',
  });
  expect(first.reportNum === '007' && first.htmlPath === 'output/cv-jane-doe-acme-labs-007.html', 'derives a stable HTML reservation from candidate and report identity');
  expect(first.pdfPath.includes('platform-engineer-007-2026-09-10.pdf'), 'PDF reservation carries role, report identity, and date');

  const second = deriveTailoringArtifactNames({
    profileText: 'candidate:\n  full_name: Jane Doe\n',
    reportPath: 'reports/008-acme-labs-2026-09-10.md',
    reportText: '# Evaluation: Acme Labs - Platform Engineer\n', date: '2026-09-10',
  });
  expect(first.htmlPath !== second.htmlPath && first.pdfPath !== second.pdfPath, 'two same-company evaluations cannot overwrite each other');

  let invalid = false;
  try { deriveTailoringArtifactNames({ profileText: '', reportPath: 'reports/acme.md', reportText: '' }); } catch { invalid = true; }
  expect(invalid, 'rejects reports without a reserved numeric identity');
} catch (error) {
  fail(`tailoring artifact tests crashed: ${error?.stack || error}`);
}
