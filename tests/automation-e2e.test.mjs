import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { pass, fail } from './helpers.mjs';
import { createCompatibilityPhases } from '../automation-runner.mjs';
import { createAutomationController } from '../lib/automation-runtime.mjs';
import { deriveTailoringArtifactNames } from '../lib/tailoring-artifacts.mjs';

console.log('\nAutomation end-to-end — local resumable fixture');
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(`${message}${detail ? `: ${detail}` : ''}`);
const root = mkdtempSync(path.join(tmpdir(), 'career-ops-automation-e2e-'));
const jobUrl = 'https://jobs.example.test/acme/123';

try {
  for (const dir of ['config', 'data', 'reports', 'jds', 'output', 'batch/tracker-additions']) mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, 'config', 'profile.yml'), 'candidate:\n  full_name: Jane Doe\n  email: jane@example.test\n');
  writeFileSync(path.join(root, 'data', 'applications.md'), '# Applications\n\n| # | Date | Company | Role | Status | Score | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n');
  writeFileSync(path.join(root, 'data', 'pipeline.md'), '# Pipeline\n\n## Pending\n');

  let scanRuns = 0;
  const fakeCommand = async (script, args = []) => {
    if (script === 'scan.mjs') {
      scanRuns++;
      const pipeline = path.join(root, 'data', 'pipeline.md');
      if (scanRuns === 1) writeFileSync(pipeline, readFileSync(pipeline, 'utf-8') + `- [ ] ${jobUrl} | Acme | Platform Engineer\n`);
      return { status: 'ok', diagnostics: [], output: '{"added":1}' };
    }
    if (script === 'openrouter-runner.mjs') {
      const pipeline = path.join(root, 'data', 'pipeline.md');
      const current = readFileSync(pipeline, 'utf-8');
      if (current.includes('- [ ]')) {
        writeFileSync(path.join(root, 'jds', '001-acme-2026-09-10.md'), `# Job description\n\n**URL:** ${jobUrl}\n\nBuild platform systems.\n`);
        writeFileSync(path.join(root, 'reports', '001-acme-2026-09-10.md'), `# Evaluation: Acme - Platform Engineer\n\n**URL:** ${jobUrl}\n**JD:** jds/001-acme-2026-09-10.md\n\n**Score:** 4.5/5\n`);
        writeFileSync(pipeline, current.replace('- [ ]', '- [x]'));
      }
      return { status: 'ok', diagnostics: [], output: 'evaluated' };
    }
    if (script === 'merge-tracker.mjs') {
      const tracker = path.join(root, 'data', 'applications.md');
      const current = readFileSync(tracker, 'utf-8');
      if (!current.includes('[001]')) writeFileSync(tracker, current + '| 1 | 2026-09-10 | Acme | Platform Engineer | Evaluated | 4.5/5 | ❌ | [001](reports/001-acme-2026-09-10.md) | |\n');
      return { status: 'ok', diagnostics: [] };
    }
    if (script === 'openai-tailor.mjs') {
      const reportPath = path.join(root, 'reports', '001-acme-2026-09-10.md');
      const artifact = deriveTailoringArtifactNames({ profileText: readFileSync(path.join(root, 'config', 'profile.yml'), 'utf-8'), reportPath, reportText: readFileSync(reportPath, 'utf-8') });
      writeFileSync(path.join(root, artifact.htmlPath), '<!doctype html><html><body>Jane Doe Platform Engineer</body></html>');
      return { status: 'ok', diagnostics: [], output: JSON.stringify(artifact) };
    }
    if (script === 'generate-pdf.mjs') {
      writeFileSync(path.join(root, args[1]), 'fixture-pdf');
      const reportNum = args.find((arg) => arg.startsWith('--report='))?.split('=')[1] || '';
      writeFileSync(path.join(root, 'data', 'pdf-index.tsv'), `# report\tpdf\thtml\tformat\tdate\n${reportNum}\t${args[1]}\t${args[0]}\tletter\t2026-09-10\n`);
      return { status: 'ok', diagnostics: [] };
    }
    if (script === 'sync-pdf-flags.mjs') {
      const tracker = path.join(root, 'data', 'applications.md');
      writeFileSync(tracker, readFileSync(tracker, 'utf-8').replace(' | ❌ | ', ' | ✅ | '));
      return { status: 'ok', diagnostics: [] };
    }
    if (script === 'verify-pipeline.mjs') return { status: 'ok', diagnostics: [] };
    return { status: 'blocked', diagnostics: [{ code: 'UNEXPECTED_COMMAND', message: script }] };
  };

  let submitClicks = 0;
  const browserFactory = () => ({
    inspect: async () => ({ url: jobUrl, captcha: false, fields: [
      { id: 'name', name: 'name', label: 'Full name', type: 'text', tag: 'input', required: true },
      { id: 'email', name: 'email', label: 'Email', type: 'email', tag: 'input', required: true },
      { id: 'resume', name: 'resume', label: 'Resume', type: 'file', tag: 'input', required: true },
    ] }),
    fill: async () => ({ filled: 3 }),
    prepareSubmit: async () => ({ ready: true, actionUrl: jobUrl, label: 'Submit application' }),
    submit: async () => { submitClicks++; return { attempted: true, confirmed: true, url: `${jobUrl}/thanks`, marker: 'application received' }; },
    close: async () => {},
  });
  const trackerFactory = () => ({ track: async (task) => {
    const tracker = path.join(root, 'data', 'applications.md');
    const current = readFileSync(tracker, 'utf-8');
    if (task.input.expectedPriorState === 'Evaluated' && current.includes(' | Evaluated | ')) {
      writeFileSync(tracker, current.replace(' | Evaluated | ', ' | Applied | '));
      return { status: 'ok', payload: { changed: true }, committedSideEffects: [{ type: 'transition', path: 'data/applications.md' }] };
    }
    return { status: 'ok', payload: { changed: false }, committedSideEffects: [] };
  } });

  const policy = {
    schemaVersion: '1.0', intervalMinutes: 5, maxApplicationsPerDay: 3, minScore: 4, tailor: true,
    submission: { mode: 'automatic', confirmation: 'I_AUTHORIZE_AUTOMATIC_SUBMISSION', allowedHosts: ['jobs.example.test'], approvedSensitiveFields: [] },
    outcomes: { mode: 'automatic', ingest: 'none', gmailLabel: '', daysBack: 14 },
  };
  let state = null;
  const store = { load: async () => structuredClone(state), save: async (next) => { state = structuredClone(next); } };
  let cycle = 0;
  const phases = createCompatibilityPhases(policy, { root, command: fakeCommand, browserFactory, trackerFactory });
  const controller = createAutomationController({ store, phases, id: () => `cycle-${++cycle}`, now: () => '2026-09-10T12:00:00.000Z' });
  const first = await controller.runCycle(policy);
  const trackerAfterFirst = readFileSync(path.join(root, 'data', 'applications.md'), 'utf-8');
  expect(first.status === 'ok' && submitClicks === 1, 'runs discovery through one confirmed external submission');
  expect(trackerAfterFirst.includes(' | Applied | ') && trackerAfterFirst.includes(' | ✅ | '), 'commits PDF readiness and Applied state to the canonical tracker');
  expect(existsSync(path.join(root, 'data', 'submission-ledger.json')) && existsSync(path.join(root, 'data', 'pdf-index.tsv')), 'persists exactly-once submission and PDF linkage ledgers');

  const second = await controller.runCycle(policy);
  const reports = readdirSync(path.join(root, 'reports')).filter((name) => name.endsWith('.md'));
  const trackerRows = readFileSync(path.join(root, 'data', 'applications.md'), 'utf-8').split(/\r?\n/).filter((line) => /^\|\s*\d+\s*\|/.test(line));
  expect(second.status === 'ok' && submitClicks === 1, 'a second cycle performs no duplicate external submission');
  expect(reports.length === 1 && trackerRows.length === 1, 'replay creates no duplicate report or tracker row');
  expect(state.completedCycles === 2 && state.applicationsByDate['2026-09-10'] === 1, 'durable state records completed cycles and the exact daily application count');
} catch (error) {
  fail(`automation end-to-end fixture crashed: ${error?.stack || error}`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
