import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { pass, fail } from './helpers.mjs';
import { createTrackerAgent } from '../tracker-agent.mjs';
import { TRACKER_SCHEMA_VERSION, trackerIdempotencyKey, validateTrackerCommand } from '../lib/tracker-contracts.mjs';

console.log('\nTracker Spec 003 — contracts, idempotency, and guarded transitions');

function expect(condition, message, detail = '') {
  if (condition) pass(message);
  else fail(`${message}${detail ? `: ${detail}` : ''}`);
}

const sandbox = mkdtempSync(path.join(tmpdir(), 'career-ops-tracker-agent-'));
try {
  mkdirSync(path.join(sandbox, 'data'), { recursive: true });
  mkdirSync(path.join(sandbox, 'templates'), { recursive: true });
  const trackerPath = path.join(sandbox, 'data', 'applications.md');
  writeFileSync(trackerPath, [
    '# Applications Tracker',
    '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 1 | 2026-09-10 | Acme | Data Engineer | 4.5/5 | Evaluated | ❌ | [7](../reports/007-acme.md) | |',
    '',
  ].join('\n'));
  writeFileSync(path.join(sandbox, 'templates', 'states.yml'), [
    'states:',
    '  - id: evaluated',
    '    label: Evaluated',
    '    aliases: []',
    '  - id: applied',
    '    label: Applied',
    '    aliases: []',
    '  - id: rejected',
    '    label: Rejected',
    '    aliases: []',
  ].join('\n'));

  const command = {
    schemaVersion: TRACKER_SCHEMA_VERSION,
    commandId: 'cmd-1',
    runId: 'run-1',
    operation: 'transition',
    selector: { report: 7 },
    targetState: 'Applied',
    expectedPriorState: 'Evaluated',
    note: 'submitted by fixture',
    requestedSideEffects: [{ type: 'transition', path: 'data/applications.md' }],
  };
  expect(validateTrackerCommand(command).length === 0, 'valid transition command passes contract validation');
  expect(trackerIdempotencyKey(command) === trackerIdempotencyKey(structuredClone(command)), 'tracker idempotency key is stable');
  const invalid = { ...command, targetState: 'Waiting', selector: { row: 1, company: 'Acme' } };
  const invalidCodes = validateTrackerCommand(invalid).map((item) => item.code);
  expect(invalidCodes.includes('TRACKER_STATE_INVALID') && invalidCodes.includes('CONTRACT_INVALID'), 'invalid state and ambiguous selector fail closed');

  const agent = createTrackerAgent({ root: sandbox });
  const task = { schemaVersion: TRACKER_SCHEMA_VERSION, taskId: 'task-1', runId: 'run-1', agentType: 'TrackerAgent', input: command };
  const first = await agent.track(task);
  expect(first.status === 'ok' && first.payload?.previousState === 'Evaluated' && first.payload?.newState === 'Applied', 'TrackerAgent transitions through the guarded compatibility writer', JSON.stringify(first));
  expect(readFileSync(trackerPath, 'utf-8').includes('| Applied |'), 'canonical Markdown tracker receives the transition');
  const replay = await agent.track(structuredClone(task));
  expect(replay.payload?.idempotencyKey === first.payload?.idempotencyKey, 'same-process replay returns the prior logical result');
  expect((readFileSync(trackerPath, 'utf-8').match(/submitted by fixture/g) || []).length === 1, 'replay does not duplicate tracker notes');

  const freshAgent = createTrackerAgent({ root: sandbox });
  const conflictTask = structuredClone(task);
  conflictTask.taskId = 'task-conflict';
  conflictTask.input = { ...command, commandId: 'cmd-conflict', runId: 'run-2', targetState: 'Rejected' };
  const conflict = await freshAgent.track(conflictTask);
  expect(conflict.status === 'blocked' && conflict.diagnostics.some((item) => item.code === 'TRACKER_CONFLICT'), 'expected-prior-state conflict is rejected inside the writer lock');
  expect(readFileSync(trackerPath, 'utf-8').includes('| Applied |'), 'conflicting transition leaves canonical state unchanged');

  const dryRun = JSON.parse(execFileSync(process.execPath, [
    path.resolve('set-status.mjs'), '--report', '7', 'Rejected', '--expected-state', 'Applied', '--dry-run', '--json',
  ], { cwd: path.resolve('.'), env: { ...process.env, CAREER_OPS_TRACKER: trackerPath }, encoding: 'utf-8' }));
  expect(dryRun.dryRun === true && dryRun.oldStatus === 'Applied' && dryRun.newStatus === 'Rejected', 'set-status compare-and-set supports a read-only preview');

  mkdirSync(path.join(sandbox, 'reports'), { recursive: true });
  writeFileSync(path.join(sandbox, 'reports', '008-beta.md'), '# Evaluation: Beta — Analytics Engineer\n', 'utf-8');
  const addCommand = {
    schemaVersion: TRACKER_SCHEMA_VERSION,
    commandId: 'cmd-add-8',
    runId: 'run-add',
    operation: 'add_evaluation',
    payload: {
      num: 8, date: '2026-09-10', company: 'Beta', role: 'Analytics Engineer',
      status: 'Evaluated', score: '4.2/5', pdf: '❌', report: '[8](reports/008-beta.md)', notes: 'automation candidate',
    },
    requestedSideEffects: [{ type: 'add_evaluation', path: 'data/applications.md' }],
  };
  const addTask = { schemaVersion: TRACKER_SCHEMA_VERSION, taskId: 'task-add', runId: 'run-add', agentType: 'TrackerAgent', input: addCommand };
  const added = await createTrackerAgent({ root: sandbox }).track(addTask);
  expect(added.status === 'ok' && added.payload?.mergeStatus === 'merged', 'TrackerAgent registers an evaluation through TSV and merge-tracker');
  expect(readFileSync(trackerPath, 'utf-8').includes('Beta | Analytics Engineer'), 'merged evaluation appears in canonical Markdown');
  const replayedAdd = await createTrackerAgent({ root: sandbox }).track(structuredClone(addTask));
  expect(replayedAdd.status === 'ok' && replayedAdd.payload?.mergeStatus === 'already_merged' && replayedAdd.payload?.changed === false, 'fresh-process add replay detects the canonical row and is a no-op');
  expect((readFileSync(trackerPath, 'utf-8').match(/Beta \| Analytics Engineer/g) || []).length === 1, 'add replay never duplicates the application row');
} catch (error) {
  fail(`tracker agent tests crashed: ${error?.stack || error}`);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
