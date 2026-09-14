import { pass, fail } from './helpers.mjs';
import { createAutomationController, validateAutomationPolicy } from '../lib/automation-runtime.mjs';
import { acquireRunnerLock, applicationCheckpoint, inspectAutomationReadiness, parseAutomationConfig, redactRuntimeText, shouldContinueWatching } from '../automation-runner.mjs';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

console.log('\nAutomation runtime — resumable continuous-cycle controller');
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(`${message}${detail ? `: ${detail}` : ''}`);

const basePolicy = {
  schemaVersion: '1.0', intervalMinutes: 5, maxApplicationsPerDay: 3, minScore: 4,
  submission: { mode: 'review', confirmation: '', allowedHosts: [] },
};

try {
  expect(validateAutomationPolicy(basePolicy).length === 0, 'review-mode policy validates');
  expect(validateAutomationPolicy({ ...basePolicy, maxApplicationsPerHour: 0, maxApplicationsPerDay: 0 }).length === 0, 'zero application caps explicitly enable unlimited mode');
  const unsafe = structuredClone(basePolicy);
  unsafe.submission.mode = 'automatic';
  expect(validateAutomationPolicy(unsafe).some((item) => item.code === 'SUBMISSION_AUTHORIZATION_REQUIRED'), 'automatic submission requires an explicit authorization token');
  const parsed = parseAutomationConfig('interval_minutes: 15\nmax_applications_per_hour: 12\nmax_applications_per_day: 80\nmin_score: 4.2\nsubmission:\n  mode: review\n');
  expect(parsed.intervalMinutes === 15 && parsed.maxApplicationsPerHour === 12 && parsed.maxApplicationsPerDay === 80 && parsed.minScore === 4.2 && parsed.outcomes.ingest === 'none', 'YAML policy maps to the runtime contract');
  const gmailPolicy = { ...basePolicy, outcomes: { mode: 'automatic', ingest: 'gmail', gmailLabel: 'Job Replies', daysBack: 14 } };
  expect(validateAutomationPolicy(gmailPolicy).length === 0, 'label-scoped Gmail outcome policy validates');
  expect(validateAutomationPolicy({ ...gmailPolicy, outcomes: { ...gmailPolicy.outcomes, gmailLabel: 'bad\nlabel' } }).some((item) => item.code === 'POLICY_INVALID'), 'multiline Gmail labels fail policy validation');

  let state = null;
  const store = { load: async () => structuredClone(state), save: async (next) => { state = structuredClone(next); } };
  const calls = [];
  let evaluateAttempts = 0;
  const phases = {
    discover: async () => { calls.push('discover'); return { status: 'ok', diagnostics: [] }; },
    evaluate: async () => { calls.push('evaluate'); evaluateAttempts++; return evaluateAttempts === 1 ? { status: 'retryable_failure', diagnostics: [{ code: 'RATE_LIMIT', phase: 'evaluate', message: 'retry' }] } : { status: 'ok', diagnostics: [] }; },
    tailor: async () => { calls.push('tailor'); return { status: 'ok', diagnostics: [] }; },
    submit: async () => { calls.push('submit'); return { status: 'ok', diagnostics: [], submittedCount: 0 }; },
    track: async () => { calls.push('track'); return { status: 'ok', diagnostics: [] }; },
  };
  const controller = createAutomationController({ store, phases, id: () => 'cycle-1', now: () => '2026-09-10T12:00:00.000Z' });
  const first = await controller.runCycle(basePolicy);
  expect(first.status === 'retryable_failure' && calls.join(',') === 'discover,evaluate', 'cycle checkpoints a transient evaluation failure');
  const resumed = await controller.runCycle(basePolicy);
  expect(resumed.status === 'ok' && calls.join(',') === 'discover,evaluate,evaluate,tailor,submit,track', 'resume skips completed discovery and continues at the failed phase');
  expect(state.completedCycles === 1 && state.activeCycle === null, 'completed cycle is durably finalized');

  const noisyState = { schemaVersion: '1.0', completedCycles: 0, applicationsByDate: {}, completedActions: [], activeCycle: { cycleId: 'noisy', startedAt: '2026-09-10T00:00:00.000Z', status: 'retryable_failure', phases: {}, diagnostics: Array.from({ length: 100 }, (_, index) => ({ code: `OLD_${index}` })) } };
  const noisyStore = { load: async () => structuredClone(noisyState), save: async (next) => Object.assign(noisyState, structuredClone(next)) };
  const noisyPhases = { discover: async () => ({ status: 'retryable_failure', diagnostics: [{ code: 'LATEST', phase: 'discover', message: 'retry' }] }) };
  await createAutomationController({ store: noisyStore, phases: noisyPhases, now: () => '2026-09-10T14:00:00.000Z' }).runCycle(basePolicy);
  expect(noisyState.activeCycle.diagnostics.length === 100 && noisyState.activeCycle.diagnostics.at(-1).code === 'LATEST', 'checkpoint diagnostics stay bounded while retaining the latest failure');
  const redacted = applicationCheckpoint({ status: 'needs_review', diagnostics: [], payload: { actionId: 'a1', filled: true, plan: { sourceUrl: 'https://jobs.example.test/apply?candidate_token=private', actions: [{ name: 'email', value: 'private@example.test' }, { name: 'salary', value: 'secret answer' }], unresolved: [] } } }, '7');
  expect(!JSON.stringify(redacted).includes('private@example.test') && !JSON.stringify(redacted).includes('secret answer') && !JSON.stringify(redacted).includes('candidate_token') && redacted.payload.form.actionCount === 2, 'application checkpoints retain progress but redact filled values and URL tokens');
  expect(redactRuntimeText('Authorization: Bearer abc123 and env super-secret-key', { OPENAI_API_KEY: 'super-secret-key' }).includes('[REDACTED]') && !redactRuntimeText('Authorization: Bearer abc123 and env super-secret-key', { OPENAI_API_KEY: 'super-secret-key' }).includes('super-secret-key'), 'runtime diagnostics redact bearer and configured secret values');

  const readinessRoot = mkdtempSync(path.join(tmpdir(), 'career-ops-readiness-'));
  const emptyReadiness = inspectAutomationReadiness({ root: readinessRoot, env: {} });
  expect(!emptyReadiness.ready && emptyReadiness.issues.some((item) => item.code === 'AUTOMATION_CONFIG_MISSING'), 'readiness reports missing configuration without exposing environment data');
  for (const directory of ['config', 'data']) mkdirSync(path.join(readinessRoot, directory), { recursive: true });
  for (const file of ['cv.md', 'portals.yml']) writeFileSync(path.join(readinessRoot, file), 'fixture\n');
  writeFileSync(path.join(readinessRoot, 'config', 'profile.yml'), 'candidate:\n  full_name: Fixture\n');
  writeFileSync(path.join(readinessRoot, 'data', 'applications.md'), '# Applications\n');
  writeFileSync(path.join(readinessRoot, 'config', 'automation.yml'), 'interval_minutes: 5\nmax_applications_per_day: 3\nmin_score: 4\ntailor: false\nsubmission:\n  mode: review\noutcomes:\n  mode: review\n  ingest: none\n');
  const ready = inspectAutomationReadiness({ root: readinessRoot, env: { OPENROUTER_API_KEY: 'test-key' } });
  expect(ready.ready && ready.policy.submissionMode === 'review', 'readiness confirms a complete non-secret configuration');
  rmSync(readinessRoot, { recursive: true, force: true });

  const capState = { schemaVersion: '1.0', applicationsByDate: { '2026-09-10': 3 }, completedActions: [] };
  const capStore = { load: async () => structuredClone(capState), save: async () => {} };
  const capped = await createAutomationController({ store: capStore, phases, now: () => '2026-09-10T13:00:00.000Z' }).runCycle(basePolicy);
  expect(capped.status === 'blocked' && capped.diagnostics[0].code === 'DAILY_CAP_REACHED', 'daily cap blocks a new cycle before side effects');
  expect(shouldContinueWatching(capped) && !shouldContinueWatching({ status: 'blocked', diagnostics: [{ code: 'POLICY_INVALID' }] }), 'watch pauses at the daily cap but stops on permanent blockers');

  const ledgerCapStore = { load: async () => ({ schemaVersion: '1.0', applicationsByDate: {}, completedActions: [] }), save: async () => {} };
  const ledgerCapped = await createAutomationController({ store: ledgerCapStore, phases, now: () => '2026-09-10T13:00:00.000Z', confirmedSubmissions: async () => 3 }).runCycle(basePolicy);
  expect(ledgerCapped.status === 'blocked' && calls.filter((item) => item === 'discover').length === 1, 'daily cap reconciles confirmed submissions after a runner crash');

  const automatic = structuredClone(basePolicy);
  automatic.submission = { mode: 'automatic', confirmation: 'I_AUTHORIZE_AUTOMATIC_SUBMISSION', allowedHosts: ['jobs.example.test'] };
  const autoStore = { load: async () => null, save: async () => {} };
  const noSubmitPhases = { ...phases };
  delete noSubmitPhases.submit;
  const noSubmit = await createAutomationController({ store: autoStore, phases: noSubmitPhases, id: () => 'cycle-auto' }).runCycle(automatic);
  expect(noSubmit.status === 'needs_review' && noSubmit.diagnostics.some((item) => item.code === 'SUBMISSION_ADAPTER_UNAVAILABLE'), 'automatic mode fails closed when no submission adapter is configured');

  const lockDir = mkdtempSync(path.join(tmpdir(), 'career-ops-automation-lock-'));
  const lockPath = path.join(lockDir, 'runner.lock');
  writeFileSync(lockPath, '999999999\n');
  const lock = acquireRunnerLock(lockPath);
  expect(existsSync(lockPath), 'runner reclaims a stale PID lock after a crash');
  let contention = false;
  try { acquireRunnerLock(lockPath); } catch (error) { contention = /active/.test(error.message); }
  expect(contention, 'runner refuses a second live instance');
  lock.release();
  expect(!existsSync(lockPath), 'runner releases its ownership lock');
  rmSync(lockDir, { recursive: true, force: true });
} catch (error) {
  fail(`automation runtime tests crashed: ${error?.stack || error}`);
}
