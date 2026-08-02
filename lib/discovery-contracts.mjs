import { createHash } from 'crypto';

export const DISCOVERY_SCHEMA_VERSION = '1.0';
export const DISCOVERY_STATUSES = new Set(['ok', 'blocked', 'needs_review', 'retryable_failure']);
export const WRITE_DISPOSITIONS = new Set(['preview', 'append_pipeline']);

const MAX_DIAGNOSTIC_MESSAGE = 500;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function stableHash(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export function makeDiagnostic(code, severity, message, options = {}) {
  const safeMessage = String(message || '')
    .replace(/https?:\/\/[^\s]+/gi, (raw) => {
      try {
        const parsed = new URL(raw);
        parsed.username = '';
        parsed.password = '';
        parsed.search = parsed.search ? '?REDACTED' : '';
        parsed.hash = '';
        return parsed.toString();
      } catch {
        return '[REDACTED_URL]';
      }
    })
    .replace(/\b(api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
  return {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    code: String(code || 'DISCOVERY_UNKNOWN'),
    severity,
    phase: 'discovery',
    retryable: Boolean(options.retryable),
    message: safeMessage.replace(/[\r\n\t]+/g, ' ').slice(0, MAX_DIAGNOSTIC_MESSAGE),
    refs: Array.isArray(options.refs) ? options.refs.map(String).slice(0, 10) : [],
  };
}

export function makePortResult(status, payload = null, diagnostics = [], meta = {}) {
  if (!DISCOVERY_STATUSES.has(status)) throw new Error(`invalid discovery result status: ${status}`);
  return {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    status,
    payload,
    diagnostics,
    retry: meta.retry ?? null,
  };
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function validateDiscoveryTask(task) {
  const errors = [];
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    return [makeDiagnostic('CONTRACT_INVALID', 'error', 'Discovery task must be an object.')];
  }
  if (task.schemaVersion !== DISCOVERY_SCHEMA_VERSION) {
    errors.push(makeDiagnostic(
      'CONTRACT_VERSION_UNSUPPORTED',
      'error',
      `Discovery schemaVersion must be ${DISCOVERY_SCHEMA_VERSION}.`,
    ));
  }
  if (typeof task.runId !== 'string' || !task.runId.trim()) {
    errors.push(makeDiagnostic('CONTRACT_INVALID', 'error', 'runId is required.'));
  }
  if (task.agentType != null && task.agentType !== 'DiscoveryAgent') {
    errors.push(makeDiagnostic('CAPABILITY_FORBIDDEN', 'error', 'Discovery only accepts DiscoveryAgent tasks.'));
  }

  const request = task.input;
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    errors.push(makeDiagnostic('CONTRACT_INVALID', 'error', 'input must contain a DiscoveryRequest.'));
    return errors;
  }
  if (request.schemaVersion !== DISCOVERY_SCHEMA_VERSION) {
    errors.push(makeDiagnostic(
      'CONTRACT_VERSION_UNSUPPORTED',
      'error',
      `DiscoveryRequest schemaVersion must be ${DISCOVERY_SCHEMA_VERSION}.`,
    ));
  }
  if (!Array.isArray(request.sourceRefs) || request.sourceRefs.length === 0) {
    errors.push(makeDiagnostic('ONBOARDING_REQUIRED', 'error', 'At least one active source reference is required.'));
  }
  if (request.targetLanePolicyRef == null) {
    errors.push(makeDiagnostic('TARGET_LANE_POLICY_MISSING', 'error', 'targetLanePolicyRef is required.'));
  }
  if (!request.filters || typeof request.filters !== 'object' || Array.isArray(request.filters)) {
    errors.push(makeDiagnostic('CONTRACT_INVALID', 'error', 'filters must be an object.'));
  }
  if (!WRITE_DISPOSITIONS.has(request.writeDisposition)) {
    errors.push(makeDiagnostic(
      'CONTRACT_INVALID',
      'error',
      'writeDisposition must be preview or append_pipeline.',
    ));
  }
  const limits = request.limits;
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
    errors.push(makeDiagnostic('CONTRACT_INVALID', 'error', 'limits must be an object.'));
  } else {
    for (const field of ['maxConcurrency', 'maxRequestsPerSource', 'maxItemsPerSource', 'timeoutMs']) {
      if (!positiveInteger(limits[field])) {
        errors.push(makeDiagnostic('CONTRACT_INVALID', 'error', `limits.${field} must be a positive integer.`));
      }
    }
    if (limits.maxPages != null && !positiveInteger(limits.maxPages)) {
      errors.push(makeDiagnostic('CONTRACT_INVALID', 'error', 'limits.maxPages must be a positive integer when set.'));
    }
    if (limits.maxDescriptionChars != null && !positiveInteger(limits.maxDescriptionChars)) {
      errors.push(makeDiagnostic('CONTRACT_INVALID', 'error', 'limits.maxDescriptionChars must be a positive integer when set.'));
    }
    if (limits.maxRetries != null && (!Number.isInteger(limits.maxRetries) || limits.maxRetries < 0 || limits.maxRetries > 5)) {
      errors.push(makeDiagnostic('CONTRACT_INVALID', 'error', 'limits.maxRetries must be an integer from 0 to 5.'));
    }
  }
  return errors;
}

export function discoveryIdempotencyKey(task) {
  return task.idempotencyKey || stableHash({
    runId: task.runId,
    mode: task.mode || 'scan',
    input: task.input,
  });
}

export function makeAgentResult(task, status, payload, diagnostics, timing, sideEffects = {}) {
  if (!DISCOVERY_STATUSES.has(status)) throw new Error(`invalid discovery result status: ${status}`);
  return {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    taskId: task?.taskId ?? null,
    runId: task?.runId ?? null,
    phase: 'discovery',
    status,
    payload,
    diagnostics,
    artifacts: sideEffects.artifacts ?? [],
    requestedSideEffects: sideEffects.requested ?? [],
    committedSideEffects: sideEffects.committed ?? [],
    timing,
    retry: sideEffects.retry ?? null,
    checkpointRef: payload?.checkpoint?.ref ?? null,
  };
}
