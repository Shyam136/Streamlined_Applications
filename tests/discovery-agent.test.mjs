import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { pass, fail } from './helpers.mjs';
import { createDiscoveryAgent } from '../discovery-agent.mjs';
import { createJobSourcePort } from '../lib/job-source-port.mjs';

console.log('\nDiscovery Spec 001 — agent integration and compatible persistence');

function expect(condition, message, detail = '') {
  if (condition) pass(message);
  else fail(`${message}${detail ? `: ${detail}` : ''}`);
}

const sandbox = mkdtempSync(path.join(tmpdir(), 'career-ops-discovery-'));

try {
  mkdirSync(path.join(sandbox, 'data'), { recursive: true });
  writeFileSync(path.join(sandbox, 'data', 'pipeline.md'), '# Pipeline\n\n## Pendientes\n\n## Procesadas\n', 'utf-8');

  const sources = [
    { name: 'Slow board', provider: 'fixture', delay: 15, jobs: [{ id: '2', title: 'Analytics Engineer', company: 'Beta', url: 'https://jobs.example.test/2', location: 'Remote' }] },
    { name: 'Fast board', provider: 'fixture', delay: 1, jobs: [{ id: '1', title: 'Data Engineer', company: 'Acme', url: 'https://jobs.example.test/1', location: 'Remote' }] },
    { name: 'Empty board', provider: 'fixture', delay: 0, jobs: [] },
  ];
  const providers = new Map([['fixture', {
    id: 'fixture',
    fetch: async (source) => {
      await new Promise((resolve) => setTimeout(resolve, source.delay));
      return source.jobs;
    },
  }]]);
  const port = createJobSourcePort({
    providers,
    contextFactory: async () => ({ transport: 'http' }),
    now: () => '2026-08-02T12:00:00.000Z',
  });
  const agent = createDiscoveryAgent({
    root: sandbox,
    now: () => '2026-08-02T12:00:00.000Z',
    loadConfiguration: async () => ({
      sources,
      portalConfig: { title_filter: { positive: ['Data Engineer', 'Analytics Engineer'], negative: [] } },
      profileConfig: {},
    }),
    createJobSourcePort: async () => port,
  });
  const task = {
    schemaVersion: '1.0',
    taskId: 'task-discovery-1',
    runId: 'run-discovery-1',
    agentType: 'DiscoveryAgent',
    mode: 'scan',
    input: {
      schemaVersion: '1.0',
      sourceRefs: [{ kind: 'source-config-list', configs: sources }],
      targetLanePolicyRef: { kind: 'target-lane-policy', policy: { target_roles: { primary: ['Data Engineer'] } } },
      filters: {},
      limits: { maxConcurrency: 2, maxRequestsPerSource: 2, maxItemsPerSource: 10, timeoutMs: 500, maxRetries: 0 },
      writeDisposition: 'append_pipeline',
    },
  };

  const first = await agent.discover(task);
  expect(first.status === 'ok', 'DiscoveryAgent completes a bounded multi-source scan');
  expect(first.payload.counts.accepted === 2 && first.payload.counts.sources === 3, 'agent reports accepted and source counts separately');
  expect(first.payload.sourceSummaries.find((item) => item.sourceName === 'Empty board')?.empty === true, 'successful empty source remains distinct from failure');
  expect(first.payload.acceptedPostings.map((item) => item.posting.company).join(',') === 'Beta,Acme', 'parallel fetch results merge deterministically by configured source order');
  expect(first.committedSideEffects.some((item) => item.type === 'append_pipeline'), 'append disposition reports committed pipeline side effect');

  const pipeline = readFileSync(path.join(sandbox, 'data', 'pipeline.md'), 'utf-8');
  expect(pipeline.includes('https://jobs.example.test/1') && pipeline.includes('https://jobs.example.test/2'), 'accepted postings are written to the existing pipeline format');
  expect(pipeline.indexOf('https://jobs.example.test/1') < pipeline.indexOf('## Procesadas'), 'legacy localized Pending section is preserved and used');
  const history = readFileSync(path.join(sandbox, 'data', 'scan-history.tsv'), 'utf-8');
  expect(history.split('\n').filter((line) => line.startsWith('https://jobs.example.test/')).length === 2, 'accepted postings append compatible scan-history rows');
  expect(readFileSync(path.join(sandbox, 'data', 'portal-health.tsv'), 'utf-8').includes('Empty board\tempty'), 'source health records empty separately from failure');
  expect(readFileSync(path.join(sandbox, 'data', 'scan-runs.tsv'), 'utf-8').includes('\tcompleted\t'), 'scan-run counters are persisted through the compatibility path');

  const replay = await agent.discover(structuredClone(task));
  expect(replay.payload.scanId === first.payload.scanId, 'duplicate task replay returns the same logical result');
  const replayPipeline = readFileSync(path.join(sandbox, 'data', 'pipeline.md'), 'utf-8');
  expect((replayPipeline.match(/https:\/\/jobs\.example\.test\/1/g) || []).length === 1, 'duplicate replay does not append a second pipeline entry');

  const freshProcessAgent = createDiscoveryAgent({
    root: sandbox,
    loadConfiguration: async () => ({
      sources,
      portalConfig: { title_filter: { positive: ['Data Engineer', 'Analytics Engineer'], negative: [] } },
      profileConfig: {},
    }),
    createJobSourcePort: async () => port,
  });
  const freshProcessTask = structuredClone(task);
  freshProcessTask.taskId = 'task-fresh-process';
  freshProcessTask.runId = 'run-fresh-process';
  freshProcessTask.input.writeDisposition = 'preview';
  const freshProcessResult = await freshProcessAgent.discover(freshProcessTask);
  expect(freshProcessResult.payload.counts.accepted === 0 && freshProcessResult.payload.counts.duplicates === 2, 'fresh agent instance reloads canonical dedup state and suppresses replayed postings');

  const resumedAgent = createDiscoveryAgent({
    root: sandbox,
    loadConfiguration: async () => ({ sources, portalConfig: { title_filter: { positive: ['Data Engineer', 'Analytics Engineer'] } }, profileConfig: {} }),
    createJobSourcePort: async () => port,
  });
  const resumeTask = structuredClone(task);
  resumeTask.runId = 'run-discovery-resume';
  resumeTask.taskId = 'task-discovery-resume';
  resumeTask.input.writeDisposition = 'preview';
  resumeTask.input.cursor = { completedSourceKeys: first.payload.checkpoint.completedSourceKeys };
  const resumed = await resumedAgent.discover(resumeTask);
  expect(resumed.payload.sourceSummaries.every((item) => item.skippedFromCheckpoint), 'checkpoint resume skips every completed source');
  expect(resumed.payload.counts.accepted === 0, 'checkpoint resume produces no duplicate accepted postings');

  const profilePath = path.join(sandbox, 'profile.md');
  writeFileSync(profilePath, '# Profile\n\n## Your Target Roles\n\n| Archetype | Notes |\n|---|---|\n| **Analytics Engineer** | Primary |\n', 'utf-8');
  const markdownPolicyAgent = createDiscoveryAgent({
    root: sandbox,
    createJobSourcePort: async () => port,
    loadState: async () => ({ blacklist: new Map(), seenUrls: new Set(), seenCompanyRoles: new Set() }),
  });
  const markdownTask = structuredClone(task);
  markdownTask.taskId = 'task-markdown-policy';
  markdownTask.runId = 'run-markdown-policy';
  markdownTask.input.sourceRefs = [{ kind: 'source-config', config: sources[0] }];
  markdownTask.input.targetLanePolicyRef = { path: 'profile.md' };
  markdownTask.input.writeDisposition = 'preview';
  const markdownPolicyResult = await markdownPolicyAgent.discover(markdownTask);
  expect(markdownPolicyResult.status === 'ok' && markdownPolicyResult.payload.counts.accepted === 1, 'user-layer modes profile Markdown can supply target lane roles');

  const mixedProviders = new Map([
    ['good', { id: 'good', fetch: async () => [{ title: 'Data Engineer', company: 'Good Co', url: 'https://jobs.example.test/good' }] }],
    ['empty', { id: 'empty', fetch: async () => [] }],
    ['failed', { id: 'failed', fetch: async () => { throw Object.assign(new Error('HTTP 503'), { status: 503 }); } }],
  ]);
  const mixedPort = createJobSourcePort({ providers: mixedProviders, contextFactory: async () => ({ transport: 'http' }), sleep: async () => {} });
  const mixedAgent = createDiscoveryAgent({
    loadConfiguration: async () => ({
      sources: [
        { name: 'Good', provider: 'good' },
        { name: 'Empty', provider: 'empty' },
        { name: 'Failed', provider: 'failed' },
      ],
      portalConfig: { title_filter: { positive: ['Data Engineer'] } },
      profileConfig: {},
    }),
    createJobSourcePort: async () => mixedPort,
    loadState: async () => ({ blacklist: new Map(), seenUrls: new Set(), seenCompanyRoles: new Set() }),
  });
  const mixedTask = structuredClone(task);
  mixedTask.taskId = 'task-mixed';
  mixedTask.runId = 'run-mixed';
  mixedTask.input.writeDisposition = 'preview';
  const mixed = await mixedAgent.discover(mixedTask);
  expect(mixed.status === 'retryable_failure', 'transient source failure is surfaced even when another source succeeds');
  expect(mixed.payload.counts.accepted === 1, 'successful source result is retained beside a failed source');
  expect(mixed.payload.sourceSummaries.find((item) => item.sourceName === 'Empty')?.empty === true, 'mixed scan preserves empty-success classification');
  expect(mixed.payload.sourceSummaries.find((item) => item.sourceName === 'Failed')?.errorKind === 'server', 'mixed scan preserves source failure class');

  const invalidTask = structuredClone(task);
  invalidTask.runId = 'run-invalid';
  invalidTask.input.sourceRefs = [];
  const invalid = await agent.discover(invalidTask);
  expect(invalid.status === 'blocked' && invalid.diagnostics.some((item) => item.code === 'ONBOARDING_REQUIRED'), 'missing source configuration fails closed');
} catch (err) {
  fail(`discovery agent integration tests crashed: ${err?.stack || err}`);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
