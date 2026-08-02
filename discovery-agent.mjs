import { existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

import {
  DISCOVERY_SCHEMA_VERSION,
  discoveryIdempotencyKey,
  makeAgentResult,
  makeDiagnostic,
  stableHash,
  validateDiscoveryTask,
} from './lib/discovery-contracts.mjs';
import { createDiscoveryPolicy } from './lib/discovery-policy.mjs';
import { createJobSourcePort } from './lib/job-source-port.mjs';
import { toLegacyOffer } from './lib/discovery-normalize.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function repoPath(root, value) {
  const candidate = path.resolve(root, String(value));
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const err = new Error('source reference resolves outside the repository');
    err.code = 'SOURCE_REF_FORBIDDEN';
    throw err;
  }
  return candidate;
}

function parsePipeline(text, label) {
  const postings = [];
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    const match = line.match(/^- \[[ x]\]\s+(https?:\/\/\S+)(?:\s+\|\s*([^|]+?))?(?:\s+\|\s*([^|]+?))?\s*$/i);
    if (!match) continue;
    postings.push({
      url: match[1],
      company: match[2]?.trim() || null,
      title: match[3]?.trim() || 'Unspecified role',
    });
  }
  return {
    name: label,
    jobSourceAdapter: 'inline',
    _inlinePostings: postings,
    _inputKind: 'pipeline',
  };
}

function sourcesFromDocument(document) {
  if (Array.isArray(document)) return document;
  if (!document || typeof document !== 'object') return [];
  return [
    ...(Array.isArray(document.tracked_companies) ? document.tracked_companies : []),
    ...(Array.isArray(document.job_boards)
      ? document.job_boards.map((entry) => ({ ...entry, _isBoard: true }))
      : []),
  ];
}

function readYaml(filePath) {
  const parsed = yaml.load(readFileSync(filePath, 'utf-8'));
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function readMarkdownTargetPolicy(filePath) {
  const text = readFileSync(filePath, 'utf-8').replace(/\r/g, '');
  const heading = text.match(/^## Your Target Roles\s*$/m);
  const rest = heading ? text.slice(heading.index + heading[0].length) : '';
  const nextHeading = rest.search(/^## /m);
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  const primary = [];
  for (const line of section.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const first = line.split('|')[1]?.replace(/\*\*/g, '').replace(/`/g, '').trim();
    if (!first || /^(?:archetype|[-: ]+)$/i.test(first)) continue;
    primary.push(first);
  }
  return { target_roles: { primary: [...new Set(primary)] } };
}

function loadReference(root, ref) {
  if (typeof ref === 'string' || (ref && typeof ref.path === 'string')) {
    const refPath = repoPath(root, typeof ref === 'string' ? ref : ref.path);
    if (!existsSync(refPath)) {
      const err = new Error(`required discovery reference is missing: ${path.relative(root, refPath)}`);
      err.code = 'ONBOARDING_REQUIRED';
      throw err;
    }
    if (path.extname(refPath).toLowerCase() === '.md' || ref?.kind === 'pipeline') {
      return { document: null, sources: [parsePipeline(readFileSync(refPath, 'utf-8'), path.basename(refPath))] };
    }
    const document = readYaml(refPath);
    return { document, sources: sourcesFromDocument(document) };
  }
  if (ref?.kind === 'source-config' && ref.config && typeof ref.config === 'object') {
    return { document: null, sources: [ref.config] };
  }
  if (ref?.kind === 'source-config-list' && Array.isArray(ref.configs)) {
    return { document: null, sources: ref.configs };
  }
  if (ref?.kind === 'posting-list' && Array.isArray(ref.postings)) {
    return {
      document: null,
      sources: [{
        name: ref.name || 'inline-postings',
        jobSourceAdapter: 'inline',
        _inlinePostings: ref.postings,
        _inputKind: 'posting-list',
      }],
    };
  }
  const err = new Error('unsupported discovery source reference');
  err.code = 'JOB_SOURCE_SCHEMA';
  throw err;
}

function loadPolicyReference(root, ref) {
  if (ref?.kind === 'target-lane-policy' && ref.policy && typeof ref.policy === 'object') return ref.policy;
  if (typeof ref === 'string' || (ref && typeof ref.path === 'string')) {
    const refPath = repoPath(root, typeof ref === 'string' ? ref : ref.path);
    if (!existsSync(refPath)) {
      const err = new Error(`target lane policy is missing: ${path.relative(root, refPath)}`);
      err.code = 'ONBOARDING_REQUIRED';
      throw err;
    }
    const extension = path.extname(refPath).toLowerCase();
    if (extension === '.md') return readMarkdownTargetPolicy(refPath);
    if (extension !== '.yml' && extension !== '.yaml') {
      const err = new Error('target lane policy must be user-layer YAML, profile Markdown, or an explicit policy object');
      err.code = 'TARGET_LANE_POLICY_INVALID';
      throw err;
    }
    return readYaml(refPath);
  }
  const err = new Error('unsupported target lane policy reference');
  err.code = 'TARGET_LANE_POLICY_INVALID';
  throw err;
}

async function defaultLoadConfiguration(request, root) {
  const loaded = request.sourceRefs.map((ref) => loadReference(root, ref));
  const documents = loaded.map((item) => item.document).filter(Boolean);
  const portalConfig = documents.find((document) => document.title_filter || document.tracked_companies || document.job_boards) || {};
  const sources = loaded.flatMap((item) => item.sources).filter((source) => source?.enabled !== false);
  const laneConfig = loadPolicyReference(root, request.targetLanePolicyRef);
  const profileConfig = laneConfig.target_roles || laneConfig.location ? laneConfig : {};
  return { sources, portalConfig, profileConfig, laneConfig };
}

async function defaultCreatePort(root, request) {
  const [{ loadProviders }, { mergeProviderPlugins }, { makeHttpCtx }] = await Promise.all([
    import('./providers/_registry.mjs'),
    import('./plugins/_engine.mjs'),
    import('./providers/_http.mjs'),
  ]);
  const providers = await loadProviders(path.join(root, 'providers'));
  await mergeProviderPlugins(providers, { root });
  providers.set('inline', {
    id: 'inline',
    detect: () => null,
    fetch: async (source) => Array.isArray(source._inlinePostings) ? source._inlinePostings : [],
  });
  return createJobSourcePort({
    providers,
    contextFactory: async () => makeHttpCtx(),
  });
}

function historyPolicy(config) {
  const parsed = Number.parseInt(config?.scan_history?.recheck_after_days, 10);
  return { recheckAfterDays: Number.isFinite(parsed) && parsed >= 0 ? parsed : null };
}

async function defaultLoadState(root, portalConfig) {
  const scan = await import('./scan.mjs');
  const paths = {
    pipelinePath: path.join(root, 'data', 'pipeline.md'),
    scanHistoryPath: path.join(root, 'data', 'scan-history.tsv'),
    applicationsPath: path.join(root, 'data', 'applications.md'),
    blacklistPath: path.join(root, 'data', 'blacklist.md'),
  };
  const policy = historyPolicy(portalConfig);
  const seenUrlState = scan.loadSeenUrls(policy, paths);
  const canonicalizeCompany = scan.buildCompanyCanonicalizer(portalConfig.company_aliases);
  return {
    blacklist: scan.loadBlacklist(paths.blacklistPath),
    seenUrls: seenUrlState.seen,
    recheckEligible: seenUrlState.recheckEligible,
    seenCompanyRoles: scan.loadSeenCompanyRoles(paths.applicationsPath, canonicalizeCompany, {
      policy,
      scanHistoryPath: paths.scanHistoryPath,
      pipelinePath: paths.pipelinePath,
    }),
  };
}

async function defaultPersist(root, result, nowIso) {
  const scan = await import('./scan.mjs');
  const dataDir = path.join(root, 'data');
  mkdirSync(dataDir, { recursive: true });
  const paths = {
    pipeline: path.join(dataDir, 'pipeline.md'),
    history: path.join(dataDir, 'scan-history.tsv'),
    runs: path.join(dataDir, 'scan-runs.tsv'),
    health: path.join(dataDir, 'portal-health.tsv'),
  };
  const offers = result.acceptedPostings.map((item) => toLegacyOffer(item.posting));
  const committed = [];
  try {
    if (offers.length) {
      await scan.appendToPipeline(offers, paths.pipeline);
      committed.push({ type: 'append_pipeline', path: path.relative(root, paths.pipeline), count: offers.length });
      scan.appendToScanHistory(offers, nowIso.slice(0, 10), 'added', paths.history);
      committed.push({ type: 'append_scan_history', path: path.relative(root, paths.history), count: offers.length });
    }

    const healthRecords = result.sourceSummaries.map((summary) => ({
      timestamp: nowIso,
      company: summary.sourceName,
      status: summary.status === 'ok'
        ? (summary.empty ? 'empty' : 'reachable')
        : (['network', 'auth', 'server', 'slug_gone'].includes(summary.errorKind) ? summary.errorKind : 'unknown'),
    }));
    if (healthRecords.length) {
      await scan.appendPortalHealth(healthRecords, paths.health);
      committed.push({ type: 'append_source_health', path: path.relative(root, paths.health), count: healthRecords.length });
    }

    scan.appendScanRunSummary({
      timestamp: nowIso,
      status: 'completed',
      companies: result.sourceSummaries.filter((summary) => !summary.isBoard).length,
      boards: result.sourceSummaries.filter((summary) => summary.isBoard).length,
      found: result.counts.raw,
      filteredTitle: result.counts.byReason.LANE_TITLE_REJECTED || 0,
      filteredTier: 0,
      filteredLocation: result.counts.byReason.LOCATION_REJECTED || 0,
      filteredPostingAge: result.counts.byReason.POSTING_AGE_REJECTED || 0,
      filteredSalary: result.counts.byReason.COMPENSATION_REJECTED || 0,
      filteredContent: result.counts.byReason.CONTENT_REJECTED || 0,
      filteredCooldown: 0,
      dupes: result.counts.duplicates,
      newAdded: offers.length,
      errors: result.sourceSummaries.filter((summary) => summary.status !== 'ok').length,
      filteredBlacklist: result.counts.byReason.BLACKLISTED_COMPANY || 0,
      filteredVisa: result.counts.byReason.VISA_POLICY_REJECTED || 0,
      filteredPostedDate: result.counts.byReason.POSTED_DATE_REJECTED || 0,
      filteredCountryEligibility: result.counts.byReason.WORK_AUTHORIZATION_REJECTED || 0,
    }, paths.runs);
    committed.push({ type: 'append_scan_run', path: path.relative(root, paths.runs), count: 1 });
    return { committed, paths };
  } catch (err) {
    err.committedSideEffects = committed;
    throw err;
  }
}

async function boundedMap(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

function countReasons(records) {
  const counts = {};
  for (const record of records) {
    for (const code of record.decision?.reasonCodes || record.reasonCodes || []) {
      counts[code] = (counts[code] || 0) + 1;
    }
  }
  return counts;
}

function finalStatus(sourceResults, reviewCount, persistenceError) {
  if (persistenceError || sourceResults.some((result) => result.status === 'retryable_failure')) return 'retryable_failure';
  const successful = sourceResults.some((result) => result.status === 'ok');
  if (!successful && sourceResults.some((result) => result.status === 'blocked')) return 'blocked';
  if (reviewCount > 0 || sourceResults.some((result) => result.status !== 'ok')) return 'needs_review';
  return 'ok';
}

export function createDiscoveryAgent(options = {}) {
  const root = options.root || ROOT;
  const now = options.now || (() => new Date().toISOString());
  const clock = options.clock || (() => Date.now());
  const cache = options.resultCache || new Map();
  const loadConfiguration = options.loadConfiguration || ((request) => defaultLoadConfiguration(request, root));
  const createPort = options.createJobSourcePort || ((request) => defaultCreatePort(root, request));
  const loadState = options.loadState || ((portalConfig) => defaultLoadState(root, portalConfig));
  const createPolicy = options.createPolicy || createDiscoveryPolicy;
  const persist = options.persist || ((result, timestamp) => defaultPersist(root, result, timestamp));

  async function discover(task) {
    const startedAt = now();
    const startedMs = clock();
    const validation = validateDiscoveryTask(task);
    if (validation.length) {
      return makeAgentResult(task, 'blocked', null, validation, {
        startedAt,
        completedAt: now(),
        durationMs: Math.max(0, clock() - startedMs),
      });
    }

    const idempotencyKey = discoveryIdempotencyKey(task);
    if (cache.has(idempotencyKey)) return structuredClone(cache.get(idempotencyKey));
    const request = task.input;
    const diagnostics = [];
    let configuration;
    try {
      configuration = await loadConfiguration(request);
    } catch (err) {
      const code = err.code || 'JOB_SOURCE_SCHEMA';
      const result = makeAgentResult(task, 'blocked', null, [
        makeDiagnostic(code, 'error', err.message, { retryable: false }),
      ], { startedAt, completedAt: now(), durationMs: Math.max(0, clock() - startedMs) });
      cache.set(idempotencyKey, result);
      return structuredClone(result);
    }

    if (!Array.isArray(configuration.sources) || configuration.sources.length === 0) {
      const result = makeAgentResult(task, 'blocked', null, [
        makeDiagnostic('ONBOARDING_REQUIRED', 'error', 'No active discovery sources are configured.'),
      ], { startedAt, completedAt: now(), durationMs: Math.max(0, clock() - startedMs) });
      cache.set(idempotencyKey, result);
      return structuredClone(result);
    }

    const [port, state] = await Promise.all([
      createPort(request),
      loadState(configuration.portalConfig || {}),
    ]);
    const policyResult = await createPolicy({
      portalConfig: configuration.portalConfig || {},
      profileConfig: configuration.profileConfig || {},
      targetLanePolicy: configuration.laneConfig || {},
      requestFilters: request.filters,
      blacklist: state.blacklist,
      seenUrls: state.seenUrls,
      seenCompanyRoles: state.seenCompanyRoles,
    });
    diagnostics.push(...(policyResult.diagnostics || []));
    if (policyResult.status !== 'ok') {
      return makeAgentResult(task, policyResult.status, null, diagnostics, {
        startedAt,
        completedAt: now(),
        durationMs: Math.max(0, clock() - startedMs),
      });
    }

    const completedKeys = new Set(Array.isArray(request.cursor?.completedSourceKeys) ? request.cursor.completedSourceKeys : []);
    const sourceResults = await boundedMap(configuration.sources, request.limits.maxConcurrency, async (source, sourceIndex) => {
      const sourceKey = stableHash({ name: source?.name, provider: source?.provider, jobSourceAdapter: source?.jobSourceAdapter, careers_url: source?.careers_url, api: source?.api });
      if (completedKeys.has(sourceKey)) {
        return { sourceIndex, sourceKey, sourceName: source.name, status: 'ok', skippedFromCheckpoint: true, normalized: [], diagnostics: [], empty: true, rawCount: 0 };
      }
      const validationResult = port.validate(source);
      if (validationResult.status !== 'ok') {
        return { sourceIndex, sourceKey, sourceName: source?.name || `source-${sourceIndex + 1}`, status: validationResult.status, diagnostics: validationResult.diagnostics, normalized: [], empty: false, rawCount: 0 };
      }
      const fetched = await port.fetch(source, null, request.limits);
      if (fetched.status !== 'ok') {
        return {
          sourceIndex,
          sourceKey,
          sourceName: source.name,
          status: fetched.status,
          errorKind: fetched.payload?.errorKind,
          adapterId: fetched.payload?.adapterId || validationResult.payload?.detection?.adapterId,
          diagnostics: fetched.diagnostics,
          normalized: [],
          empty: false,
          rawCount: 0,
        };
      }
      const normalized = fetched.payload.items.map((raw, itemIndex) => ({
        itemIndex,
        raw,
        result: port.normalize(raw, {
          adapterId: fetched.payload.adapterId,
          sourceName: source.name,
          defaultCompany: !source._isBoard && !source._inputKind ? source.name : null,
          discoveredAt: fetched.payload.fetchedAt,
          maxDescriptionChars: request.limits.maxDescriptionChars,
        }),
      }));
      return {
        sourceIndex,
        sourceKey,
        sourceName: source.name,
        isBoard: Boolean(source._isBoard),
        adapterId: fetched.payload.adapterId,
        status: 'ok',
        diagnostics: fetched.diagnostics,
        normalized,
        empty: fetched.payload.empty,
        rawCount: fetched.payload.items.length,
        requestCount: fetched.payload.requestCount,
        truncated: fetched.payload.truncated,
      };
    });

    const acceptedPostings = [];
    const rejectedPostings = [];
    const reviewCandidates = [];
    for (const sourceResult of sourceResults) {
      diagnostics.push(...(sourceResult.diagnostics || []));
      for (const item of sourceResult.normalized) {
        diagnostics.push(...(item.result.diagnostics || []));
        if (item.result.status !== 'ok') {
          const record = {
            sourceName: sourceResult.sourceName,
            sourceIndex: sourceResult.sourceIndex,
            itemIndex: item.itemIndex,
            status: item.result.status,
            reasonCodes: item.result.diagnostics.map((diagnostic) => diagnostic.code),
            diagnostics: item.result.diagnostics,
          };
          if (item.result.status === 'needs_review') reviewCandidates.push(record);
          else rejectedPostings.push(record);
          continue;
        }
        const posting = item.result.payload;
        const decision = policyResult.payload.evaluate(posting);
        const record = {
          sourceName: sourceResult.sourceName,
          sourceIndex: sourceResult.sourceIndex,
          itemIndex: item.itemIndex,
          posting,
          decision,
        };
        if (decision.status === 'accepted') {
          policyResult.payload.commitIdentity(decision);
          acceptedPostings.push(record);
        } else if (decision.status === 'needs_review') {
          reviewCandidates.push(record);
        } else {
          rejectedPostings.push(record);
        }
      }
    }

    const completedSourceKeys = sourceResults
      .filter((result) => result.status === 'ok')
      .map((result) => result.sourceKey);
    const allRejected = [...rejectedPostings, ...reviewCandidates];
    const byReason = countReasons(allRejected);
    const duplicateCodes = new Set(['DUPLICATE_URL', 'DUPLICATE_COMPANY_ROLE']);
    const duplicateCount = allRejected.filter((record) => (record.decision?.reasonCodes || record.reasonCodes || []).some((code) => duplicateCodes.has(code))).length;
    const resultPayload = {
      schemaVersion: DISCOVERY_SCHEMA_VERSION,
      scanId: idempotencyKey,
      sourceSummaries: sourceResults.map((result) => ({
        sourceName: result.sourceName,
        adapterId: result.adapterId || null,
        status: result.status,
        errorKind: result.errorKind || null,
        empty: Boolean(result.empty),
        raw: result.rawCount || 0,
        normalized: result.normalized?.filter((item) => item.result.status === 'ok').length || 0,
        requests: result.requestCount || 0,
        truncated: Boolean(result.truncated),
        isBoard: Boolean(result.isBoard),
        skippedFromCheckpoint: Boolean(result.skippedFromCheckpoint),
      })),
      acceptedPostings,
      rejectedPostings,
      reviewCandidates,
      counts: {
        sources: sourceResults.length,
        raw: sourceResults.reduce((sum, result) => sum + (result.rawCount || 0), 0),
        normalized: sourceResults.reduce((sum, result) => sum + (result.normalized?.filter((item) => item.result.status === 'ok').length || 0), 0),
        accepted: acceptedPostings.length,
        rejected: rejectedPostings.length,
        needsReview: reviewCandidates.length,
        duplicates: duplicateCount,
        byReason,
      },
      checkpoint: {
        schemaVersion: DISCOVERY_SCHEMA_VERSION,
        ref: `discovery-checkpoint:${stableHash({ runId: task.runId, completedSourceKeys })}`,
        completedSourceKeys,
      },
      pipelineWrite: {
        disposition: request.writeDisposition,
        attempted: false,
        acceptedCount: acceptedPostings.length,
        committed: false,
      },
    };

    const requestedSideEffects = request.writeDisposition === 'append_pipeline'
      ? [
        { type: 'append_pipeline', path: 'data/pipeline.md', count: acceptedPostings.length },
        { type: 'append_scan_history', path: 'data/scan-history.tsv', count: acceptedPostings.length },
        { type: 'append_source_health', path: 'data/portal-health.tsv', count: sourceResults.length },
        { type: 'append_scan_run', path: 'data/scan-runs.tsv', count: 1 },
      ]
      : [];
    let committedSideEffects = [];
    let persistenceError = null;
    if (request.writeDisposition === 'append_pipeline') {
      resultPayload.pipelineWrite.attempted = true;
      try {
        const persisted = await persist(resultPayload, now());
        committedSideEffects = persisted.committed || [];
        resultPayload.pipelineWrite.committed = true;
        resultPayload.pipelineWrite.artifacts = persisted.paths || {};
      } catch (err) {
        persistenceError = err;
        committedSideEffects = err.committedSideEffects || [];
        diagnostics.push(makeDiagnostic(
          'PIPELINE_WRITE_FAILED',
          'error',
          `Discovery persistence failed: ${err.message}`,
          { retryable: true },
        ));
      }
    }

    const status = finalStatus(sourceResults, reviewCandidates.length, persistenceError);
    const result = makeAgentResult(task, status, resultPayload, diagnostics, {
      startedAt,
      completedAt: now(),
      durationMs: Math.max(0, clock() - startedMs),
    }, {
      requested: requestedSideEffects,
      committed: committedSideEffects,
      artifacts: committedSideEffects.map((sideEffect) => sideEffect.path).filter(Boolean),
      retry: status === 'retryable_failure' ? { safe: true, checkpointRef: resultPayload.checkpoint.ref } : null,
    });
    cache.set(idempotencyKey, result);
    return structuredClone(result);
  }

  return { discover };
}

const defaultAgent = createDiscoveryAgent();

export async function discover(task) {
  return defaultAgent.discover(task);
}
