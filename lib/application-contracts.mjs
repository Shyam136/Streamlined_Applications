import { stableHash } from './discovery-contracts.mjs';

export const APPLICATION_SCHEMA_VERSION = '1.0';
export const APPLICATION_STATUSES = new Set(['ok', 'blocked', 'needs_review', 'retryable_failure']);

export function applicationDiagnostic(code, severity, message, options = {}) {
  return {
    schemaVersion: APPLICATION_SCHEMA_VERSION,
    code, severity, phase: 'application', retryable: Boolean(options.retryable),
    message: String(message || '').replace(/[\r\n\t]+/g, ' ').slice(0, 500),
    details: options.details ?? null,
  };
}

export function validateApplicationTask(task) {
  const errors = [];
  const add = (code, message) => errors.push(applicationDiagnostic(code, 'error', message));
  if (!task || typeof task !== 'object' || Array.isArray(task)) return [applicationDiagnostic('CONTRACT_INVALID', 'error', 'Application task must be an object.')];
  if (task.schemaVersion !== APPLICATION_SCHEMA_VERSION || task.input?.schemaVersion !== APPLICATION_SCHEMA_VERSION) add('CONTRACT_VERSION_UNSUPPORTED', `schemaVersion must be ${APPLICATION_SCHEMA_VERSION}.`);
  if (task.agentType != null && task.agentType !== 'ApplicationAgent') add('CAPABILITY_FORBIDDEN', 'Application only accepts ApplicationAgent tasks.');
  for (const field of ['taskId', 'runId']) if (typeof task[field] !== 'string' || !task[field].trim()) add('CONTRACT_INVALID', `${field} is required.`);
  const input = task.input;
  if (!input || typeof input !== 'object') return [...errors, applicationDiagnostic('CONTRACT_INVALID', 'error', 'input is required.')];
  let url;
  try { url = new URL(input.applyUrl); } catch { add('APPLICATION_URL_INVALID', 'applyUrl must be a valid HTTPS URL.'); }
  if (url && url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') add('APPLICATION_URL_INVALID', 'applyUrl must use HTTPS.');
  if (!input.trackerSelector || typeof input.trackerSelector !== 'object') add('CONTRACT_INVALID', 'trackerSelector is required.');
  if (!input.verifiedValues || typeof input.verifiedValues !== 'object') add('TRUTH_MISSING', 'verifiedValues is required.');
  if (!input.policy || !['review', 'automatic'].includes(input.policy.mode)) add('POLICY_INVALID', 'policy.mode must be review or automatic.');
  if (input.policy?.mode === 'automatic') {
    if (input.policy.confirmation !== 'I_AUTHORIZE_AUTOMATIC_SUBMISSION') add('SUBMISSION_AUTHORIZATION_REQUIRED', 'Automatic submission lacks its confirmation token.');
    if (!Array.isArray(input.policy.allowedHosts) || !url || !input.policy.allowedHosts.includes(url.hostname)) add('SUBMISSION_HOST_FORBIDDEN', 'Application host is not explicitly allowlisted.');
  }
  return errors;
}

export function submissionActionId(input) {
  return stableHash({ applyUrl: input.applyUrl, trackerSelector: input.trackerSelector, candidateEmail: input.verifiedValues?.email || null });
}

export function makeApplicationResult(task, status, payload, diagnostics, timing, effects = {}) {
  if (!APPLICATION_STATUSES.has(status)) throw new Error(`invalid application status: ${status}`);
  return {
    schemaVersion: APPLICATION_SCHEMA_VERSION, taskId: task?.taskId ?? null, runId: task?.runId ?? null,
    phase: 'application', status, payload, diagnostics,
    artifacts: effects.artifacts || [], requestedSideEffects: effects.requested || [], committedSideEffects: effects.committed || [],
    timing, retry: effects.retry || null,
  };
}
