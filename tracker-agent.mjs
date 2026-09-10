import { fileURLToPath } from 'url';
import path from 'path';

import {
  makeTrackerAgentResult,
  trackerDiagnostic,
  trackerIdempotencyKey,
  validateTrackerCommand,
} from './lib/tracker-contracts.mjs';
import { createTrackerPort } from './lib/tracker-port.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export function createTrackerAgent(options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const clock = options.clock || (() => Date.now());
  const port = options.port || createTrackerPort({ root: options.root || ROOT, scriptRoot: options.scriptRoot || ROOT });
  const cache = options.resultCache || new Map();

  async function track(task) {
    const startedAt = now();
    const startedMs = clock();
    const command = task?.input;
    const errors = validateTrackerCommand(command);
    const finish = (status, payload, diagnostics, sideEffects = {}) => makeTrackerAgentResult(
      task, status, payload, diagnostics,
      { startedAt, completedAt: now(), durationMs: Math.max(0, clock() - startedMs) },
      sideEffects,
    );
    if (task?.agentType != null && task.agentType !== 'TrackerAgent') {
      errors.push(trackerDiagnostic('CAPABILITY_FORBIDDEN', 'error', 'Tracker only accepts TrackerAgent tasks.'));
    }
    if (errors.length) return finish('blocked', null, errors);

    const key = trackerIdempotencyKey(command);
    if (cache.has(key)) return structuredClone(cache.get(key));
    const executed = await port.execute({ ...command, idempotencyKey: key });
    const committed = executed.status === 'ok' && executed.payload?.changed
      ? executed.payload.changedPaths.map((changedPath) => ({ type: command.operation, path: changedPath }))
      : [];
    const result = finish(executed.status, executed.payload && { ...executed.payload, idempotencyKey: key }, executed.diagnostics || [], {
      requested: command.requestedSideEffects,
      committed,
      artifacts: committed.map((item) => item.path),
      retry: executed.status === 'retryable_failure' ? { safe: true } : null,
    });
    cache.set(key, result);
    return structuredClone(result);
  }

  return { track };
}

const defaultAgent = createTrackerAgent();
export async function track(task) { return defaultAgent.track(task); }
