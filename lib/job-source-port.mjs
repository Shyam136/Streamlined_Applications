import { makeDiagnostic, makePortResult } from './discovery-contracts.mjs';
import { normalizePosting } from './discovery-normalize.mjs';

export class RequestBudgetError extends Error {
  constructor(limit) {
    super(`job-source request budget exhausted (${limit})`);
    this.name = 'RequestBudgetError';
    this.code = 'JOB_SOURCE_BUDGET_EXHAUSTED';
  }
}

function errorKind(err) {
  if (err?.code === 'JOB_SOURCE_BUDGET_EXHAUSTED') return 'budget';
  if (err?.name === 'AbortError' || /ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(String(err?.message || err))) return 'network';
  const status = Number(err?.status);
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404 || status === 410) return 'not_found';
  if (status >= 500) return 'server';
  if (/HTTP 429/.test(String(err?.message || ''))) return 'rate_limit';
  if (/HTTP 5\d\d/.test(String(err?.message || ''))) return 'server';
  return 'unknown';
}

function retryable(kind) {
  return kind === 'network' || kind === 'rate_limit' || kind === 'server';
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`job-source fetch timed out after ${timeoutMs}ms`);
      err.name = 'AbortError';
      reject(err);
    }, timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function wrapContext(base, budget) {
  let requests = 0;
  const wrap = (fn) => fn && (async (...args) => {
    if (requests >= budget.maxRequestsPerSource) throw new RequestBudgetError(budget.maxRequestsPerSource);
    requests++;
    return fn(...args);
  });
  return {
    ...base,
    maxPages: budget.maxPages,
    fetchJson: wrap(base.fetchJson),
    fetchText: wrap(base.fetchText),
    requestCount: () => requests,
  };
}

function explicitAdapterId(source) {
  return source?.jobSourceAdapter || source?.provider || null;
}

export function createJobSourcePort(options) {
  const providers = options.providers;
  const contextFactory = options.contextFactory;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now || (() => new Date().toISOString());
  const healthState = new Map();

  function detect(source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return makePortResult('blocked', null, [makeDiagnostic('JOB_SOURCE_SCHEMA', 'error', 'Source configuration must be an object.')]);
    }
    if (source.provider && source.jobSourceAdapter && source.provider !== source.jobSourceAdapter) {
      return makePortResult('needs_review', null, [
        makeDiagnostic('JOB_SOURCE_AMBIGUOUS', 'warning', 'provider and jobSourceAdapter identify different adapters.'),
      ]);
    }
    const explicit = explicitAdapterId(source);
    if (explicit) {
      if (!providers.has(explicit)) {
        return makePortResult('needs_review', null, [
          makeDiagnostic('JOB_SOURCE_UNKNOWN', 'warning', `Unknown job-source adapter: ${explicit}.`),
        ]);
      }
      return makePortResult('ok', { adapterId: explicit, confidence: 1, reason: source.provider ? 'legacy-provider-key' : 'explicit' });
    }

    const hits = [];
    const detectionDiagnostics = [];
    for (const provider of providers.values()) {
      if (typeof provider.detect !== 'function') continue;
      try {
        const hit = provider.detect(source);
        if (hit) hits.push({
          adapterId: provider.id,
          confidence: Number(hit.confidence) || (provider.id === 'local-parser' ? 0.95 : 0.8),
          capability: hit,
        });
      } catch (err) {
        detectionDiagnostics.push(
          makeDiagnostic('JOB_SOURCE_DETECT_FAILED', 'warning', `Adapter detection failed for ${provider.id}: ${err.message}`),
        );
      }
    }
    if (hits.length === 0) {
      return makePortResult('needs_review', null, [
        ...detectionDiagnostics,
        makeDiagnostic('JOB_SOURCE_UNSUPPORTED', 'warning', 'No job-source adapter matched the source.'),
      ]);
    }
    hits.sort((a, b) => b.confidence - a.confidence || a.adapterId.localeCompare(b.adapterId));
    if (hits.length > 1 && hits[0].confidence === hits[1].confidence) {
      return makePortResult('needs_review', { candidates: hits }, [
        makeDiagnostic('JOB_SOURCE_AMBIGUOUS', 'warning', `Multiple job-source adapters matched: ${hits.map((hit) => hit.adapterId).join(', ')}.`),
      ]);
    }
    return makePortResult('ok', hits[0], detectionDiagnostics);
  }

  function validate(source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return makePortResult('blocked', { valid: false, detection: null }, [
        makeDiagnostic('JOB_SOURCE_SCHEMA', 'error', 'Source configuration must be an object.'),
      ]);
    }
    if (typeof source.name !== 'string' || !source.name.trim()) {
      return makePortResult('blocked', { valid: false, detection: null }, [
        makeDiagnostic('JOB_SOURCE_SCHEMA', 'error', 'Source configuration requires a non-empty name.'),
      ]);
    }
    const detection = detect(source);
    if (detection.status !== 'ok') {
      return makePortResult(detection.status, { valid: false, detection: detection.payload }, detection.diagnostics);
    }
    return makePortResult('ok', { valid: true, detection: detection.payload }, detection.diagnostics);
  }

  async function fetchPage(source, cursor, budget) {
    if (cursor?.done === true) {
      return makePortResult('ok', { items: [], nextCursor: null, empty: true, requestCount: 0 });
    }
    const detection = detect(source);
    if (detection.status !== 'ok') return detection;
    const adapterId = detection.payload.adapterId;
    const adapter = providers.get(adapterId);
    const baseContext = await contextFactory(source, budget);
    const context = wrapContext(baseContext, budget);
    let attempt = 0;
    const maxRetries = budget.maxRetries ?? 0;
    for (;;) {
      try {
        const items = await withTimeout(Promise.resolve(adapter.fetch(source, context)), budget.timeoutMs);
        if (!Array.isArray(items)) {
          throw Object.assign(new Error(`${adapterId}: fetch() did not return an array`), { code: 'JOB_SOURCE_SCHEMA' });
        }
        const capped = items.slice(0, budget.maxItemsPerSource);
        const diagnostics = items.length > capped.length
          ? [makeDiagnostic('JOB_SOURCE_ITEM_LIMIT', 'warning', `Source returned ${items.length} items; capped at ${budget.maxItemsPerSource}.`)]
          : [];
        const payload = {
          adapterId,
          sourceName: source.name,
          items: capped,
          nextCursor: null,
          empty: items.length === 0,
          truncated: items.length > capped.length,
          requestCount: context.requestCount(),
          fetchedAt: now(),
        };
        healthState.set(source.name, { status: items.length === 0 ? 'empty' : 'ok', adapterId, timestamp: payload.fetchedAt });
        return makePortResult('ok', payload, diagnostics);
      } catch (err) {
        const kind = errorKind(err);
        if (retryable(kind) && attempt < maxRetries) {
          attempt++;
          await sleep(Math.min(2_000, 100 * (2 ** (attempt - 1))));
          continue;
        }
        const canRetry = retryable(kind);
        const code = err?.code === 'JOB_SOURCE_SCHEMA' ? 'JOB_SOURCE_SCHEMA'
          : kind === 'budget' ? 'JOB_SOURCE_BUDGET_EXHAUSTED'
            : 'JOB_SOURCE_FETCH_FAILED';
        healthState.set(source.name, { status: 'failed', adapterId, errorKind: kind, timestamp: now() });
        return makePortResult(canRetry ? 'retryable_failure' : 'blocked', {
          adapterId,
          sourceName: source.name,
          empty: false,
          errorKind: kind,
          requestCount: context.requestCount(),
        }, [makeDiagnostic(code, canRetry ? 'warning' : 'error', `Job-source fetch failed for ${source.name}: ${err.message}`, { retryable: canRetry })], {
          retry: canRetry ? { attempts: attempt + 1, maxRetries } : null,
        });
      }
    }
  }

  function normalize(rawItem, context = {}) {
    return normalizePosting(rawItem, context);
  }

  function health(source) {
    const known = healthState.get(source?.name);
    if (known) return makePortResult('ok', known);
    const detection = detect(source);
    if (detection.status !== 'ok') return detection;
    return makePortResult('ok', {
      status: 'unknown',
      adapterId: detection.payload.adapterId,
      timestamp: now(),
    });
  }

  return { detect, validate, fetch: fetchPage, normalize, health };
}
