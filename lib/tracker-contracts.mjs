import { stableHash } from './discovery-contracts.mjs';

export const TRACKER_SCHEMA_VERSION = '1.0';
export const TRACKER_RESULT_STATUSES = new Set(['ok', 'blocked', 'needs_review', 'retryable_failure']);
export const TRACKER_OPERATIONS = new Set(['add_evaluation', 'transition', 'reconcile', 'verify']);
export const CANONICAL_STATES = new Set(['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Hired', 'Rejected', 'Discarded', 'SKIP']);

const SCORE_RE = /^\d+(?:\.\d+)?\/5$/;
const SCORE_SENTINELS = new Set(['N/A', '—', '-']);

export function trackerDiagnostic(code, severity, message, options = {}) {
  return {
    schemaVersion: TRACKER_SCHEMA_VERSION,
    code,
    severity,
    phase: 'tracker',
    retryable: Boolean(options.retryable),
    message: String(message || '').replace(/[\r\n\t]+/g, ' ').slice(0, 500),
    details: options.details ?? null,
  };
}

function requiredString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateTrackerCommand(command) {
  const errors = [];
  const add = (code, message) => errors.push(trackerDiagnostic(code, 'error', message));
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    return [trackerDiagnostic('CONTRACT_INVALID', 'error', 'TrackerCommand must be an object.')];
  }
  if (command.schemaVersion !== TRACKER_SCHEMA_VERSION) add('CONTRACT_VERSION_UNSUPPORTED', `Tracker schemaVersion must be ${TRACKER_SCHEMA_VERSION}.`);
  for (const field of ['commandId', 'runId']) if (!requiredString(command[field])) add('CONTRACT_INVALID', `${field} is required.`);
  if (!TRACKER_OPERATIONS.has(command.operation)) add('CONTRACT_INVALID', 'operation must be add_evaluation, transition, reconcile, or verify.');
  if (!Array.isArray(command.requestedSideEffects)) add('CONTRACT_INVALID', 'requestedSideEffects must be an array.');

  if (command.operation === 'add_evaluation') {
    const row = command.payload;
    if (!row || typeof row !== 'object') add('CONTRACT_INVALID', 'add_evaluation requires an EvaluationRowInput payload.');
    else {
      if (!Number.isInteger(row.num) || row.num <= 0) add('CONTRACT_INVALID', 'payload.num must be a positive integer.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date || '')) add('CONTRACT_INVALID', 'payload.date must be YYYY-MM-DD.');
      for (const field of ['company', 'role', 'report']) if (!requiredString(row[field])) add('CONTRACT_INVALID', `payload.${field} is required.`);
      if (!CANONICAL_STATES.has(row.status)) add('TRACKER_STATE_INVALID', 'payload.status must be canonical.');
      if (!SCORE_RE.test(row.score || '') && !SCORE_SENTINELS.has(row.score)) add('CONTRACT_INVALID', 'payload.score must be X.X/5, N/A, —, or -.');
      if (!['✅', '❌'].includes(row.pdf)) add('CONTRACT_INVALID', 'payload.pdf must be ✅ or ❌.');
    }
  }
  if (command.operation === 'transition') {
    if (!command.selector || typeof command.selector !== 'object') add('CONTRACT_INVALID', 'transition requires a selector.');
    else {
      const selectors = ['row', 'report', 'company'].filter((key) => command.selector[key] != null);
      if (selectors.length !== 1) add('CONTRACT_INVALID', 'selector must contain exactly one of row, report, or company.');
    }
    if (!CANONICAL_STATES.has(command.targetState)) add('TRACKER_STATE_INVALID', 'targetState must be canonical.');
    if (command.expectedPriorState != null && !CANONICAL_STATES.has(command.expectedPriorState)) add('TRACKER_STATE_INVALID', 'expectedPriorState must be canonical when provided.');
  }
  return errors;
}

export function trackerIdempotencyKey(command) {
  return command.idempotencyKey || stableHash({
    runId: command.runId,
    operation: command.operation,
    selector: command.selector ?? null,
    targetState: command.targetState ?? null,
    expectedPriorState: command.expectedPriorState ?? null,
    payload: command.payload ?? null,
  });
}

export function makeTrackerAgentResult(task, status, payload, diagnostics, timing, sideEffects = {}) {
  if (!TRACKER_RESULT_STATUSES.has(status)) throw new Error(`invalid tracker result status: ${status}`);
  return {
    schemaVersion: TRACKER_SCHEMA_VERSION,
    taskId: task?.taskId ?? null,
    runId: task?.runId ?? null,
    phase: 'tracker',
    status,
    payload,
    diagnostics,
    artifacts: sideEffects.artifacts ?? [],
    requestedSideEffects: sideEffects.requested ?? [],
    committedSideEffects: sideEffects.committed ?? [],
    timing,
    retry: sideEffects.retry ?? null,
  };
}
