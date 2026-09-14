#!/usr/bin/env node
import { execFile } from 'child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import yaml from 'js-yaml';

try { (await import('dotenv')).config({ quiet: true }); } catch { /* optional */ }

import { createAutomationController, validateAutomationPolicy } from './lib/automation-runtime.mjs';
import { buildApplicationQueue, loadVerifiedApplicationValues } from './lib/application-queue.mjs';
import { inspectTailoringQueue } from './lib/tailoring-queue.mjs';
import { applyAutomaticOutcomeReview, buildOutcomeReview } from './lib/outcome-review.mjs';
import { deriveTailoringArtifactNames } from './lib/tailoring-artifacts.mjs';
import { createApplicationAgent } from './application-agent.mjs';
import { createPlaywrightApplicationPort } from './lib/playwright-application-port.mjs';
import { createTrackerAgent } from './tracker-agent.mjs';
import { countConfirmedSubmissions, countConfirmedSubmissionsSince } from './lib/submission-ledger.mjs';
import { fetchGmailReplyCandidates } from './lib/gmail-reply-port.mjs';

const runFile = promisify(execFile);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(ROOT, 'config', 'automation.yml');
const STATE = path.join(ROOT, 'data', 'automation-state.json');
const LOCK = path.join(ROOT, 'data', '.automation-runner.lock');
const SUBMISSION_LEDGER = path.join(ROOT, 'data', 'submission-ledger.json');

export function redactRuntimeText(value, env = process.env) {
  let text = String(value || '').replace(/(authorization:\s*bearer\s+)[^\s]+/ig, '$1[REDACTED]');
  for (const [name, secret] of Object.entries(env || {})) {
    if (!/(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name) || typeof secret !== 'string' || secret.length < 8) continue;
    text = text.split(secret).join('[REDACTED]');
  }
  return text.replace(/[\r\n\t]+/g, ' ').slice(-1000);
}

function checkpointUrl(raw) {
  try { const url = new URL(raw); url.search = ''; url.hash = ''; return url.href; }
  catch { return null; }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

export function acquireRunnerLock(file = LOCK) {
  mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const descriptor = openSync(file, 'wx');
      writeFileSync(descriptor, `${process.pid}\n`, 'utf-8');
      return { descriptor, release: () => { closeSync(descriptor); rmSync(file, { force: true }); } };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let owner = 0;
      try { owner = Number.parseInt(readFileSync(file, 'utf-8').trim(), 10); } catch { /* reclaim below */ }
      if (processAlive(owner)) throw new Error(`Another automation runner is active (PID ${owner}).`);
      try { rmSync(file, { force: true }); } catch { /* retry produces the useful error */ }
    }
  }
  throw new Error('Could not acquire the automation runner lock.');
}

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  renameSync(temp, file);
}

export function createFileStateStore(file = STATE) {
  return {
    async load() {
      if (!existsSync(file)) return null;
      try { return JSON.parse(readFileSync(file, 'utf-8')); }
      catch (error) { throw new Error(`Cannot parse automation state: ${error.message}`); }
    },
    async save(value) { atomicJson(file, value); },
  };
}

export function parseAutomationConfig(raw) {
  const source = yaml.load(raw) || {};
  return {
    schemaVersion: '1.0',
    intervalMinutes: Number(source.interval_minutes ?? 60),
    maxApplicationsPerDay: Number(source.max_applications_per_day ?? 20),
    maxApplicationsPerHour: Number(source.max_applications_per_hour ?? 15),
    minScore: Number(source.min_score ?? 4),
    tailor: source.tailor !== false,
    submission: {
      mode: source.submission?.mode || 'review',
      confirmation: source.submission?.confirmation || '',
      allowedHosts: Array.isArray(source.submission?.allowed_hosts) ? source.submission.allowed_hosts : [],
      approvedSensitiveFields: Array.isArray(source.submission?.approved_sensitive_fields) ? source.submission.approved_sensitive_fields : [],
    },
    outcomes: {
      mode: source.outcomes?.mode || 'review',
      ingest: source.outcomes?.ingest || 'none',
      gmailLabel: source.outcomes?.gmail_label || '',
      daysBack: Number(source.outcomes?.days_back ?? 14),
    },
  };
}

export function shouldContinueWatching(result) {
  if (result?.status === 'ok' || result?.status === 'retryable_failure') return true;
  return result?.status === 'blocked' && result.diagnostics?.some((item) => item.code === 'DAILY_CAP_REACHED');
}

async function command(script, args = [], env = {}, root = ROOT) {
  try {
    const result = await runFile(process.execPath, [path.join(root, script), ...args], {
      cwd: root, env: { ...process.env, ...env }, windowsHide: true, maxBuffer: 10 * 1024 * 1024,
    });
    return { status: 'ok', output: String(result.stdout || '').slice(-4000), diagnostics: [] };
  } catch (error) {
    return { status: 'retryable_failure', diagnostics: [{ code: 'COMMAND_FAILED', phase: script, message: redactRuntimeText(error.stderr || error.message), retryable: true }] };
  }
}

function finalJsonLine(output) {
  const lines = String(output || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    try { return JSON.parse(lines[index]); } catch { /* keep looking */ }
  }
  return null;
}

export function applicationCheckpoint(result, reportNum) {
  return {
    reportNum, status: result.status,
    diagnostics: (result.diagnostics || []).map((item) => ({ ...item, message: redactRuntimeText(item.message) })),
    payload: result.payload ? {
      actionId: result.payload.actionId || null,
      submitted: Boolean(result.payload.submitted),
      submittedThisRun: Boolean(result.payload.submittedThisRun),
      replay: Boolean(result.payload.replay),
      filled: Boolean(result.payload.filled),
      form: result.payload.plan ? {
        sourceUrl: checkpointUrl(result.payload.plan.sourceUrl),
        actionCount: result.payload.plan.actions?.length || 0,
        unresolved: result.payload.plan.unresolved || [],
        captcha: Boolean(result.payload.plan.captcha),
      } : null,
    } : null,
  };
}

export function createCompatibilityPhases(policy, options = {}) {
  const root = options.root || ROOT;
  const runCommand = options.command || ((script, args, env) => command(script, args, env, root));
  const browserFactory = options.browserFactory || ((browserOptions) => createPlaywrightApplicationPort(browserOptions));
  const trackerFactory = options.trackerFactory || ((trackerOptions) => createTrackerAgent(trackerOptions));
  const applicationFactory = options.applicationFactory || ((applicationOptions) => createApplicationAgent(applicationOptions));
  const gmailFetcher = options.gmailFetcher || fetchGmailReplyCandidates;
  const submissionLedger = options.submissionLedger || path.join(root, 'data', 'submission-ledger.json');
  const pendingCount = () => {
    if (!existsSync(path.join(root, 'data', 'pipeline.md'))) return 0;
    return readFileSync(path.join(root, 'data', 'pipeline.md'), 'utf-8').split(/\r?\n/).filter((line) => /^- \[ \] /.test(line)).length;
  };
  return {
    discover: () => runCommand('scan.mjs', ['--json']),
    evaluate: async () => {
      const before = pendingCount();
      const evaluated = await runCommand('openrouter-runner.mjs', ['pipeline']);
      if (evaluated.status !== 'ok') return evaluated;
      const remaining = pendingCount();
      if (remaining > 0) {
        return { status: 'retryable_failure', diagnostics: [{ code: 'EVALUATION_INCOMPLETE', phase: 'evaluate', message: `${remaining} of ${before} pending postings remain after evaluation.`, retryable: true }] };
      }
      const merged = await runCommand('merge-tracker.mjs');
      return merged.status === 'ok' ? { status: 'ok', diagnostics: [], pendingBefore: before, pendingAfter: remaining } : merged;
    },
    tailor: async () => {
      if (!policy.tailor) return { status: 'ok', diagnostics: [], skipped: true };
      const queue = inspectTailoringQueue({ root, minScore: policy.minScore });
      const results = [];
      for (const item of queue.ready) {
        const expected = deriveTailoringArtifactNames({
          profileText: readFileSync(path.join(root, 'config', 'profile.yml'), 'utf-8'),
          reportPath: item.reportPath, reportText: readFileSync(item.reportPath, 'utf-8'),
        });
        let artifact = expected;
        if (!existsSync(path.join(root, expected.htmlPath))) {
          const tailored = await runCommand('openai-tailor.mjs', ['--jd', item.jdPath, '--report', item.reportPath, '--json']);
          if (tailored.status !== 'ok') return tailored;
          artifact = finalJsonLine(tailored.output);
          if (!artifact?.htmlPath || !artifact?.pdfPath || !artifact?.reportNum
            || artifact.htmlPath !== expected.htmlPath || artifact.pdfPath !== expected.pdfPath || artifact.reportNum !== expected.reportNum) {
            return { status: 'retryable_failure', diagnostics: [{ code: 'TAILORING_OUTPUT_INVALID', phase: 'tailor', message: `Report ${item.reportNum} did not return its reserved artifact manifest.`, retryable: true }] };
          }
        }
        const rendered = await runCommand('generate-pdf.mjs', [artifact.htmlPath, artifact.pdfPath, '--format=letter', `--report=${artifact.reportNum}`]);
        if (rendered.status !== 'ok') return rendered;
        results.push(artifact);
      }
      if (results.length) {
        const synced = await runCommand('sync-pdf-flags.mjs');
        if (synced.status !== 'ok') return synced;
      }
      const reviewDiagnostics = queue.blocked.map((item) => ({
        code: 'TAILORING_INPUT_MISSING', phase: 'tailor', severity: 'warning',
        message: `Report ${item.reportNum}: ${item.reason}. Re-evaluate or archive the JD before tailoring.`, retryable: false,
      }));
      return { status: 'ok', diagnostics: reviewDiagnostics, tailoredCount: results.length, reviewCount: queue.blocked.length, results };
    },
    submit: async ({ today, usedToday }) => {
      const dailyRemaining = Math.max(0, policy.maxApplicationsPerDay - usedToday);
      const hourlyCap = policy.maxApplicationsPerHour ?? policy.maxApplicationsPerDay;
      const submittedLastHour = countConfirmedSubmissionsSince(submissionLedger, Date.now() - 60 * 60_000);
      const hourlyRemaining = Math.max(0, hourlyCap - submittedLastHour);
      const remaining = Math.min(dailyRemaining, hourlyRemaining);
      if (remaining === 0) return { status: 'ok', diagnostics: [], submittedCount: 0, reviewedCount: 0, hourlyCapReached: true };
      const queue = buildApplicationQueue({ root, minScore: policy.minScore, limit: remaining });
      if (!queue.length) return { status: 'ok', diagnostics: [], submittedCount: 0, reviewedCount: 0 };
      const baseValues = loadVerifiedApplicationValues(root);
      let submittedCount = 0;
      const results = [];
      for (const item of queue) {
        const browser = browserFactory({ root, allowedHosts: policy.submission.allowedHosts, headless: true });
        const trackerAgent = trackerFactory({ root });
        const agent = applicationFactory({ root, browser, tracker: async (transition) => trackerAgent.track({
          schemaVersion: '1.0', taskId: `track-submit-${item.reportNum}`, runId: `automation-${today}`, agentType: 'TrackerAgent',
          input: {
            schemaVersion: '1.0', commandId: `submit-${item.reportNum}`, runId: `automation-${today}`, operation: 'transition',
            selector: transition.selector, targetState: transition.targetState, expectedPriorState: transition.expectedPriorState,
            note: transition.note, requestedSideEffects: [{ type: 'transition', path: 'data/applications.md' }],
          },
        }) });
        const result = await agent.apply({
          schemaVersion: '1.0', taskId: `apply-${item.reportNum}`, runId: `automation-${today}`, agentType: 'ApplicationAgent',
          requestedSideEffects: policy.submission.mode === 'automatic' ? [{ type: 'external_submission', host: new URL(item.applyUrl).hostname }] : [],
          input: {
            schemaVersion: '1.0', applyUrl: item.applyUrl, trackerSelector: { report: Number(item.reportNum) },
            verifiedValues: { ...baseValues, resumePath: item.pdfRelativePath }, policy: policy.submission,
          },
        });
        results.push(applicationCheckpoint(result, item.reportNum));
        if (result.payload?.submittedThisRun) submittedCount++;
        if (result.status !== 'ok') {
          if (policy.submission.mode === 'automatic' && result.status === 'needs_review') continue;
          return { status: result.status, diagnostics: result.diagnostics, submittedCount, results };
        }
      }
      const reviewResults = results.filter((item) => item.status === 'needs_review');
      return {
        status: 'ok', submittedCount, reviewCount: reviewResults.length, results,
        diagnostics: reviewResults.flatMap((item) => item.diagnostics || []).map((item) => ({ ...item, severity: item.severity || 'warning' })),
      };
    },
    track: async ({ today }) => {
      const verified = await runCommand('verify-pipeline.mjs');
      if (verified.status !== 'ok') return verified;
      const candidatesPath = path.join(root, 'data', 'reply-candidates.json');
      let candidates = [];
      try { if (existsSync(candidatesPath)) candidates = JSON.parse(readFileSync(candidatesPath, 'utf-8')); }
      catch (error) { return { status: 'needs_review', diagnostics: [{ code: 'OUTCOME_INPUT_INVALID', phase: 'track', message: `Cannot parse reply candidates: ${error.message}`, retryable: false }] }; }
      if (!Array.isArray(candidates)) return { status: 'needs_review', diagnostics: [{ code: 'OUTCOME_INPUT_INVALID', phase: 'track', message: 'Reply candidates must be a JSON array.', retryable: false }] };
      if (policy.outcomes?.ingest === 'gmail') {
        let incoming;
        try {
          incoming = await gmailFetcher({
            credentials: { clientId: process.env.GMAIL_CLIENT_ID, clientSecret: process.env.GMAIL_CLIENT_SECRET, refreshToken: process.env.GMAIL_REFRESH_TOKEN },
            label: policy.outcomes.gmailLabel, daysBack: policy.outcomes.daysBack,
            existingMessageIds: candidates.map((item) => item.message_id),
          });
        } catch (error) {
          return { status: 'retryable_failure', diagnostics: [{ code: 'GMAIL_REPLY_INGEST_FAILED', phase: 'track', message: redactRuntimeText(error.message), retryable: true }] };
        }
        if (incoming.length) {
          candidates = [...candidates, ...incoming];
          atomicJson(candidatesPath, candidates);
        }
      }
      if (!candidates.length) return { status: 'ok', diagnostics: [], outcomeReview: null };
      const trackerText = readFileSync(path.join(root, 'data', 'applications.md'), 'utf-8');
      const review = buildOutcomeReview({ candidates, trackerText });
      if (!review.needsReview) return { status: 'ok', diagnostics: [], outcomeReview: review };
      if (policy.outcomes?.mode === 'automatic') {
        const trackerAgent = trackerFactory({ root });
        const applied = await applyAutomaticOutcomeReview(review, (recommendation) => trackerAgent.track({
            schemaVersion: '1.0', taskId: `outcome-${recommendation.messageId}`, runId: `outcomes-${today}`, agentType: 'TrackerAgent',
            input: {
              schemaVersion: '1.0', commandId: `outcome-${recommendation.messageId}`, runId: `outcomes-${today}`, operation: 'transition',
              selector: { row: recommendation.trackerNum }, targetState: recommendation.to, expectedPriorState: recommendation.from,
              note: `authenticated employer reply ${recommendation.messageId}`, requestedSideEffects: [{ type: 'transition', path: 'data/applications.md' }],
            },
          }));
        return {
          status: 'ok', outcomeReview: review, transitionResults: applied.results,
          diagnostics: applied.unresolvedCount ? [{ code: 'OUTCOME_REVIEW_REQUIRED', phase: 'track', severity: 'warning', retryable: false, message: `${applied.unresolvedCount} outcome item(s) remain unresolved after automatic high-confidence updates.` }] : [],
        };
      }
      const reviewResult = { status: 'needs_review', outcomeReview: review, diagnostics: [{
        code: 'OUTCOME_REVIEW_REQUIRED', phase: 'track', retryable: false,
        message: `${review.recommendations.length} tracker update(s) and ${review.unresolved.length} unresolved reply/replies require review. Run node reply-watch.mjs.`,
      }] };
      return reviewResult;
    },
  };
}

export function inspectAutomationReadiness(options = {}) {
  const root = options.root || ROOT;
  const env = options.env || process.env;
  const configPath = path.join(root, 'config', 'automation.yml');
  const issues = [];
  let policy = null;
  if (!existsSync(configPath)) {
    issues.push({ code: 'AUTOMATION_CONFIG_MISSING', message: 'Copy config/automation.example.yml to config/automation.yml and review its limits.' });
  } else {
    try {
      policy = parseAutomationConfig(readFileSync(configPath, 'utf-8'));
      issues.push(...validateAutomationPolicy(policy));
    } catch (error) {
      issues.push({ code: 'AUTOMATION_CONFIG_INVALID', message: redactRuntimeText(error.message, env) });
    }
  }
  for (const file of ['cv.md', 'config/profile.yml', 'portals.yml', 'data/applications.md']) {
    if (!existsSync(path.join(root, file))) issues.push({ code: 'ONBOARDING_REQUIRED', file, message: `${file} is missing.` });
  }
  if (!env.OPENROUTER_API_KEY) issues.push({ code: 'EVALUATION_CREDENTIAL_MISSING', message: 'OPENROUTER_API_KEY is required by the continuous evaluation phase.' });
  if (policy?.tailor) {
    let localTailoringEndpoint = false;
    try { localTailoringEndpoint = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.OPENAI_BASE_URL || '').hostname); } catch { /* invalid endpoint is diagnosed by its command */ }
    if (!env.OPENAI_API_KEY && !localTailoringEndpoint && !(env.OPENROUTER_API_KEY && env.CAREER_OPS_MODEL)) {
      issues.push({ code: 'TAILORING_PROVIDER_MISSING', message: 'Configure an OpenAI-compatible endpoint or pin CAREER_OPS_MODEL for OpenRouter tailoring.' });
    }
  }
  if (policy?.outcomes?.ingest === 'gmail') {
    const missing = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'].filter((name) => !env[name]);
    if (missing.length) issues.push({ code: 'GMAIL_CREDENTIALS_MISSING', fields: missing, message: `Gmail outcome ingest credentials are missing: ${missing.join(', ')}.` });
  }
  return {
    ready: issues.length === 0,
    issues,
    policy: policy ? {
      intervalMinutes: policy.intervalMinutes, maxApplicationsPerDay: policy.maxApplicationsPerDay,
      maxApplicationsPerHour: policy.maxApplicationsPerHour,
      minScore: policy.minScore, tailor: policy.tailor, submissionMode: policy.submission.mode,
      outcomeMode: policy.outcomes.mode, outcomeIngest: policy.outcomes.ingest,
    } : null,
  };
}

async function runCli() {
  const action = process.argv[2] || 'status';
  if (action === 'status') {
    console.log(JSON.stringify({ state: await createFileStateStore().load() || { status: 'not_started' }, readiness: inspectAutomationReadiness() }, null, 2));
    return;
  }
  if (!['run', 'watch'].includes(action)) throw new Error('Usage: node automation-runner.mjs status|run|watch');
  if (!existsSync(CONFIG)) throw new Error('config/automation.yml is missing; copy config/automation.example.yml and review it first.');
  const policy = parseAutomationConfig(readFileSync(CONFIG, 'utf-8'));
  const policyErrors = validateAutomationPolicy(policy);
  if (policyErrors.length) throw new Error(policyErrors.map((item) => `${item.code}: ${item.message}`).join('; '));
  const readiness = inspectAutomationReadiness();
  if (!readiness.ready) throw new Error(readiness.issues.map((item) => `${item.code}: ${item.message}`).join('; '));

  const lock = acquireRunnerLock();
  try {
    const controller = createAutomationController({
      store: createFileStateStore(), phases: createCompatibilityPhases(policy),
      confirmedSubmissions: (date) => countConfirmedSubmissions(SUBMISSION_LEDGER, date),
    });
    do {
      const result = await controller.runCycle(policy);
      console.log(JSON.stringify(result, null, 2));
      if (action !== 'watch') break;
      if (!shouldContinueWatching(result)) break;
      await new Promise((resolve) => setTimeout(resolve, policy.intervalMinutes * 60_000));
    } while (true);
  } finally {
    lock.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => { console.error(`automation-runner: ${error.message}`); process.exit(1); });
}
