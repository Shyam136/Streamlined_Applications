import { randomUUID } from 'crypto';

export const AUTOMATION_SCHEMA_VERSION = '1.0';
export const AUTOMATION_STATUSES = new Set(['ok', 'blocked', 'needs_review', 'retryable_failure']);

function normalizeResult(result, phase) {
  if (!result || !AUTOMATION_STATUSES.has(result.status)) {
    return { status: 'blocked', diagnostics: [{ code: 'PHASE_RESULT_INVALID', phase, message: `${phase} returned an invalid result.` }] };
  }
  return { diagnostics: [], ...result };
}

export function validateAutomationPolicy(policy) {
  const errors = [];
  const add = (code, message) => errors.push({ code, phase: 'preflight', message });
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return [{ code: 'POLICY_INVALID', phase: 'preflight', message: 'automation policy must be an object' }];
  if (policy.schemaVersion !== AUTOMATION_SCHEMA_VERSION) add('CONTRACT_VERSION_UNSUPPORTED', `schemaVersion must be ${AUTOMATION_SCHEMA_VERSION}`);
  if (!Number.isInteger(policy.intervalMinutes) || policy.intervalMinutes < 1) add('POLICY_INVALID', 'intervalMinutes must be a positive integer');
  if (!Number.isInteger(policy.maxApplicationsPerDay) || policy.maxApplicationsPerDay < 0) add('POLICY_INVALID', 'maxApplicationsPerDay must be a non-negative integer; 0 disables the cap');
  if (policy.maxApplicationsPerHour != null && (!Number.isInteger(policy.maxApplicationsPerHour) || policy.maxApplicationsPerHour < 0)) add('POLICY_INVALID', 'maxApplicationsPerHour must be a non-negative integer; 0 disables the cap');
  if (typeof policy.minScore !== 'number' || policy.minScore < 0 || policy.minScore > 5) add('POLICY_INVALID', 'minScore must be between 0 and 5');
  const submission = policy.submission;
  if (!submission || !['review', 'automatic'].includes(submission.mode)) add('POLICY_INVALID', 'submission.mode must be review or automatic');
  if (submission?.mode === 'automatic') {
    if (submission.confirmation !== 'I_AUTHORIZE_AUTOMATIC_SUBMISSION') add('SUBMISSION_AUTHORIZATION_REQUIRED', 'automatic submission requires the exact confirmation token');
    if (!Array.isArray(submission.allowedHosts) || submission.allowedHosts.length === 0) add('POLICY_INVALID', 'automatic submission requires a non-empty allowedHosts list');
  }
  const outcomes = policy.outcomes || { mode: 'review', ingest: 'none' };
  if (!['review', 'automatic'].includes(outcomes.mode)) add('POLICY_INVALID', 'outcomes.mode must be review or automatic');
  if (!['none', 'gmail'].includes(outcomes.ingest)) add('POLICY_INVALID', 'outcomes.ingest must be none or gmail');
  if (outcomes.ingest === 'gmail') {
    if (typeof outcomes.gmailLabel !== 'string' || !outcomes.gmailLabel.trim() || /[\r\n"]/.test(outcomes.gmailLabel)) add('POLICY_INVALID', 'outcomes.gmailLabel must be a non-empty single-line label without quotes');
    if (!Number.isInteger(outcomes.daysBack) || outcomes.daysBack < 1 || outcomes.daysBack > 365) add('POLICY_INVALID', 'outcomes.daysBack must be an integer from 1 to 365');
  }
  return errors;
}

export function createAutomationController(options) {
  const store = options.store;
  const phases = options.phases;
  const now = options.now || (() => new Date().toISOString());
  const id = options.id || randomUUID;

  async function runCycle(policy) {
    const validation = validateAutomationPolicy(policy);
    if (validation.length) return { schemaVersion: AUTOMATION_SCHEMA_VERSION, status: 'blocked', diagnostics: validation, cycle: null };

    const state = await store.load() || { schemaVersion: AUTOMATION_SCHEMA_VERSION, completedCycles: 0, applicationsByDate: {}, completedActions: [] };
    const today = now().slice(0, 10);
    const recordedToday = Number(state.applicationsByDate?.[today] || 0);
    const confirmedToday = typeof options.confirmedSubmissions === 'function'
      ? Math.max(0, Number(await options.confirmedSubmissions(today)) || 0)
      : 0;
    const usedToday = Math.max(recordedToday, confirmedToday);
    if (usedToday !== recordedToday) {
      state.applicationsByDate = { ...(state.applicationsByDate || {}), [today]: usedToday };
      await store.save(state);
    }
    if (policy.maxApplicationsPerDay > 0 && usedToday >= policy.maxApplicationsPerDay) {
      return { schemaVersion: AUTOMATION_SCHEMA_VERSION, status: 'blocked', diagnostics: [{ code: 'DAILY_CAP_REACHED', phase: 'preflight', message: `Daily application cap (${policy.maxApplicationsPerDay}) reached.` }], cycle: state.activeCycle || null };
    }

    const order = ['discover', 'evaluate', 'tailor', 'submit', 'track'];
    const cycle = state.activeCycle && !['ok', 'blocked'].includes(state.activeCycle.status)
      ? state.activeCycle
      : { cycleId: id(), startedAt: now(), status: 'running', phases: {}, diagnostics: [] };
    state.activeCycle = cycle;
    await store.save(state);

    for (const phase of order) {
      if (cycle.phases[phase]?.status === 'ok') continue;
      const handler = phases[phase];
      if (typeof handler !== 'function') {
        const result = phase === 'submit'
          ? { status: 'needs_review', diagnostics: [{ code: 'SUBMISSION_ADAPTER_UNAVAILABLE', phase, message: 'No automatic submission adapter is configured.' }] }
          : { status: 'blocked', diagnostics: [{ code: 'PHASE_UNAVAILABLE', phase, message: `${phase} phase is unavailable.` }] };
        cycle.phases[phase] = { ...result, completedAt: now() };
        cycle.status = result.status;
        cycle.diagnostics = [...cycle.diagnostics, ...result.diagnostics].slice(-100);
        await store.save(state);
        return { schemaVersion: AUTOMATION_SCHEMA_VERSION, status: result.status, diagnostics: cycle.diagnostics, cycle };
      }

      cycle.phases[phase] = { status: 'running', startedAt: now() };
      await store.save(state);
      let raw;
      try { raw = await handler({ policy, state, cycle, today, usedToday }); }
      catch (error) { raw = { status: 'retryable_failure', diagnostics: [{ code: 'PHASE_EXCEPTION', phase, message: error.message, retryable: true }] }; }
      const result = normalizeResult(raw, phase);
      cycle.phases[phase] = { ...result, completedAt: now() };
      cycle.diagnostics = [...cycle.diagnostics, ...result.diagnostics].slice(-100);
      if (result.status !== 'ok') {
        cycle.status = result.status;
        await store.save(state);
        return { schemaVersion: AUTOMATION_SCHEMA_VERSION, status: result.status, diagnostics: cycle.diagnostics, cycle };
      }
      if (phase === 'submit') {
        const count = Math.max(0, Number(result.submittedCount || 0));
        state.applicationsByDate = { ...(state.applicationsByDate || {}), [today]: usedToday + count };
      }
      await store.save(state);
    }

    cycle.status = 'ok';
    cycle.completedAt = now();
    state.completedCycles = Number(state.completedCycles || 0) + 1;
    state.lastCompletedCycle = cycle;
    state.activeCycle = null;
    await store.save(state);
    return { schemaVersion: AUTOMATION_SCHEMA_VERSION, status: 'ok', diagnostics: cycle.diagnostics, cycle };
  }

  return { runCycle };
}
