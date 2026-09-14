import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { pass, fail } from './helpers.mjs';
import { createApplicationAgent } from '../application-agent.mjs';
import { buildApplicationFillPlan } from '../lib/application-form.mjs';
import { countConfirmedSubmissions, countConfirmedSubmissionsSince } from '../lib/submission-ledger.mjs';

console.log('\nApplicationAgent — guarded form filling and exactly-once submission intent');
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(`${message}${detail ? `: ${detail}` : ''}`);
const sandbox = mkdtempSync(path.join(tmpdir(), 'career-ops-application-agent-'));

const form = {
  url: 'https://jobs.example.test/acme/1', captcha: false,
  fields: [
    { id: 'first', name: 'first_name', label: 'First name', type: 'text', tag: 'input', required: true },
    { id: 'email', name: 'email', label: 'Email', type: 'email', tag: 'input', required: true },
    { id: 'resume', name: 'resume', label: 'Resume', type: 'file', tag: 'input', required: true },
    { id: 'why', name: 'why_us', label: 'Why do you want to work here?', type: 'text', tag: 'textarea', required: false },
  ],
};
const values = { firstName: 'Jane', email: 'jane@example.test', resumePath: 'output/cv.pdf', fields: { why_us: 'Mission alignment.' } };
const policy = (mode) => ({ mode, confirmation: mode === 'automatic' ? 'I_AUTHORIZE_AUTOMATIC_SUBMISSION' : '', allowedHosts: ['jobs.example.test'], approvedSensitiveFields: [] });
const task = (mode = 'review') => ({
  schemaVersion: '1.0', taskId: `task-${mode}`, runId: 'run-1', agentType: 'ApplicationAgent',
  requestedSideEffects: [{ type: 'external_submission', host: 'jobs.example.test' }],
  input: { schemaVersion: '1.0', applyUrl: form.url, trackerSelector: { report: 1 }, verifiedValues: values, policy: policy(mode) },
});

try {
  const plan = buildApplicationFillPlan(form, values);
  expect(plan.canSubmit && plan.actions.length === 4 && plan.actions.some((item) => item.action === 'upload'), 'fill plan maps verified text and upload values');
  const sensitive = buildApplicationFillPlan({ url: form.url, fields: [{ id: 'dob', name: 'dob', label: 'Date of birth', required: true, type: 'text', tag: 'input' }] }, { fields: { dob: '2000-01-01' } });
  expect(!sensitive.canSubmit && sensitive.unresolved[0]?.reason === 'sensitive_or_legal', 'sensitive required fields need scoped approval even when a value exists');
  const empty = buildApplicationFillPlan({ url: form.url, fields: [] }, values);
  expect(!empty.canSubmit && empty.unresolved[0]?.reason === 'application_form_not_found', 'an empty job-detail page cannot advance to submission intent');
  const choices = buildApplicationFillPlan({ url: form.url, fields: [
    { id: 'country', name: 'country', label: 'Country', tag: 'select', type: 'select-one', required: true, options: [{ label: 'United States', value: 'US' }] },
    { id: 'updates', name: 'updates', label: 'Email updates', tag: 'input', type: 'checkbox', required: false },
  ] }, { fields: { country: 'United States', updates: 'false' } });
  expect(choices.canSubmit && choices.actions[0].value === 'US' && choices.actions[1].value === false, 'normalizes verified select labels and checkbox booleans');
  const invalidChoice = buildApplicationFillPlan({ url: form.url, fields: [{ id: 'country', name: 'country', label: 'Country', tag: 'select', type: 'select-one', required: true, options: [{ label: 'Canada', value: 'CA' }] }] }, { fields: { country: 'United States' } });
  expect(!invalidChoice.canSubmit && invalidChoice.unresolved[0]?.reason === 'verified_option_not_found', 'fails closed when a verified choice is absent from the live form');

  let fills = 0;
  let submits = 0;
  const browser = { inspect: async () => form, fill: async () => { fills++; }, submit: async () => { submits++; return { confirmed: true, url: 'https://jobs.example.test/thanks', marker: 'application received' }; } };
  const review = await createApplicationAgent({ root: sandbox, browser }).apply(task('review'));
  expect(review.status === 'needs_review' && review.payload?.filled && submits === 0, 'review mode fills but never submits');

  const trackerCalls = [];
  const tracker = async (command) => { trackerCalls.push(command); return { status: 'ok', committedSideEffects: [{ type: 'transition', path: 'data/applications.md' }] }; };
  const automaticAgent = createApplicationAgent({ root: sandbox, browser, tracker });
  const submitted = await automaticAgent.apply(task('automatic'));
  expect(submitted.status === 'ok' && submitted.payload?.submitted && submits === 1, 'automatic mode submits after all policy and field gates pass');
  expect(trackerCalls[0]?.targetState === 'Applied' && trackerCalls[0]?.expectedPriorState === 'Evaluated', 'confirmed submission requests a conflict-safe tracker transition');
  const replay = await createApplicationAgent({ root: sandbox, browser, tracker }).apply(task('automatic'));
  expect(replay.status === 'ok' && replay.payload?.replay && replay.payload?.submittedThisRun === false && submits === 1, 'fresh-process replay reconciles tracking without counting or submitting twice');
  expect(countConfirmedSubmissions(path.join(sandbox, 'data', 'submission-ledger.json'), new Date().toISOString().slice(0, 10)) === 1, 'confirmed submission ledger supports crash-safe daily-cap reconciliation');
  expect(countConfirmedSubmissionsSince(path.join(sandbox, 'data', 'submission-ledger.json'), Date.now() - 60 * 60_000) === 1, 'confirmed submission ledger supports a rolling hourly cap');

  const crashRoot = path.join(sandbox, 'crash');
  let crashSubmits = 0;
  const crashingBrowser = { inspect: async () => form, fill: async () => {}, submit: async () => { crashSubmits++; throw new Error('connection dropped'); } };
  const uncertain = await createApplicationAgent({ root: crashRoot, browser: crashingBrowser }).apply(task('automatic'));
  expect(uncertain.status === 'needs_review' && uncertain.diagnostics.some((item) => item.code === 'SUBMISSION_STATE_AMBIGUOUS'), 'post-intent browser failure becomes ambiguous instead of retryable');
  const refused = await createApplicationAgent({ root: crashRoot, browser: crashingBrowser }).apply(task('automatic'));
  expect(refused.status === 'needs_review' && crashSubmits === 1, 'ambiguous submission ledger permanently suppresses blind retry');

  const captchaBrowser = { inspect: async () => ({ ...form, captcha: true }), fill: async () => { throw new Error('must not fill'); } };
  const captcha = await createApplicationAgent({ root: path.join(sandbox, 'captcha'), browser: captchaBrowser }).apply(task('automatic'));
  expect(captcha.status === 'needs_review' && captcha.diagnostics[0]?.code === 'CAPTCHA_REQUIRED', 'CAPTCHA stops before filling or submission');

  let unavailableSubmits = 0;
  const noFinalControl = { inspect: async () => form, fill: async () => {}, prepareSubmit: async () => ({ ready: false, reason: 'next step only' }), submit: async () => { unavailableSubmits++; } };
  const noControlRoot = path.join(sandbox, 'no-final-control');
  const noControl = await createApplicationAgent({ root: noControlRoot, browser: noFinalControl }).apply(task('automatic'));
  const noControlReplay = await createApplicationAgent({ root: noControlRoot, browser: noFinalControl }).apply(task('automatic'));
  expect(noControl.status === 'needs_review' && noControl.diagnostics[0]?.code === 'SUBMISSION_CONTROL_UNRESOLVED' && unavailableSubmits === 0, 'validates the final control before recording submission intent');
  expect(noControlReplay.diagnostics[0]?.code === 'SUBMISSION_CONTROL_UNRESOLVED', 'missing final controls do not poison future runs as ambiguous submissions');
} catch (error) {
  fail(`application agent tests crashed: ${error?.stack || error}`);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
