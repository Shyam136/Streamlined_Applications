import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { trackerDiagnostic } from './tracker-contracts.mjs';
import { extractTrackerReportNumbers, parseTrackerRow, resolveColumns } from '../tracker-parse.mjs';
import { normalizeCompany } from '../tracker-utils.mjs';

const execFileAsync = promisify(execFile);

function classifyFailure(error) {
  const stdout = String(error?.stdout || '');
  let body = null;
  try { body = JSON.parse(stdout); } catch { /* human-mode or no JSON */ }
  const code = body?.code || 'tracker-command-failed';
  const diagnosticCode = code === 'ambiguous' || code.includes('mismatch')
    ? 'TRACKER_SELECTOR_AMBIGUOUS'
    : code === 'state-conflict'
      ? 'TRACKER_CONFLICT'
      : code === 'no-tracker'
        ? 'TRACKER_MISSING'
        : 'TRACKER_COMMAND_FAILED';
  const retryable = /lock|busy|timeout/i.test(`${code} ${body?.error || error?.message || ''}`);
  return {
    status: retryable ? 'retryable_failure' : diagnosticCode === 'TRACKER_SELECTOR_AMBIGUOUS' ? 'needs_review' : 'blocked',
    diagnostic: trackerDiagnostic(diagnosticCode, 'error', body?.error || error?.message || 'Tracker command failed.', { retryable, details: body }),
  };
}

function readRows(trackerPath) {
  if (!existsSync(trackerPath)) return [];
  const lines = readFileSync(trackerPath, 'utf-8').split(/\r?\n/);
  const columns = resolveColumns(lines);
  return lines.map((line) => parseTrackerRow(line, columns)).filter(Boolean);
}

function reportNumber(report) {
  const match = String(report || '').match(/^\[(\d+)\]\([^)]+\)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function findEvaluationRow(trackerPath, row) {
  const wantedReport = reportNumber(row.report);
  const wantedCompany = normalizeCompany(row.company);
  return readRows(trackerPath).find((candidate) =>
    normalizeCompany(candidate.company) === wantedCompany
      && extractTrackerReportNumbers(candidate.report).includes(wantedReport));
}

function safeCell(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

export function createTrackerPort(options = {}) {
  const scriptRoot = options.scriptRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const root = options.root || scriptRoot;
  const run = options.run || execFileAsync;
  const trackerPath = options.trackerPath || path.join(root, 'data', 'applications.md');

  async function execute(command) {
    if (command.operation === 'add_evaluation') {
      const row = command.payload;
      if (!existsSync(trackerPath)) {
        return { status: 'blocked', payload: null, diagnostics: [trackerDiagnostic('TRACKER_MISSING', 'error', `Tracker is missing at ${trackerPath}.`)] };
      }
      const existing = findEvaluationRow(trackerPath, row);
      if (existing) {
        return {
          status: 'ok', diagnostics: [],
          payload: {
            commandId: command.commandId,
            operation: command.operation,
            resolvedSelector: { row: existing.num, company: existing.company, role: existing.role },
            previousState: existing.status,
            newState: existing.status,
            changedPaths: [], changed: false, mergeStatus: 'already_merged', derivedIndexRefresh: 'not_requested',
          },
        };
      }
      const link = String(row.report).match(/^\[\d+\]\(([^)]+)\)$/)?.[1];
      const reportPath = link ? path.resolve(root, link) : null;
      const reportsRoot = path.resolve(root, 'reports');
      if (!reportPath || (reportPath !== reportsRoot && !reportPath.startsWith(reportsRoot + path.sep)) || !existsSync(reportPath)) {
        return { status: 'blocked', payload: null, diagnostics: [trackerDiagnostic('TRACKER_REPORT_MISMATCH', 'error', 'Evaluation report must exist under reports/ before tracker registration.')] };
      }
      const additionsDir = options.additionsDir || path.join(root, 'batch', 'tracker-additions');
      mkdirSync(additionsDir, { recursive: true });
      const filename = `${row.num}-${String(command.commandId).replace(/[^a-zA-Z0-9._-]/g, '-')}.tsv`;
      const additionPath = path.join(additionsDir, filename);
      const fields = [row.num, row.date, row.company, row.role, row.status, row.score, row.pdf, row.report, row.notes || ''];
      if (row.via) fields.push(`via=${row.via}`);
      const content = fields.map(safeCell).join('\t') + '\n';
      try {
        if (existsSync(additionPath) && readFileSync(additionPath, 'utf-8') !== content) {
          return { status: 'blocked', payload: null, diagnostics: [trackerDiagnostic('TRACKER_CONFLICT', 'error', `Pending addition ${filename} has different content.`)] };
        }
        if (!existsSync(additionPath)) writeFileSync(additionPath, content, { encoding: 'utf-8', flag: 'wx' });
        await run(process.execPath, [path.join(scriptRoot, 'merge-tracker.mjs')], {
          cwd: scriptRoot,
          env: {
            ...process.env,
            CAREER_OPS_TRACKER: trackerPath,
            CAREER_OPS_ADDITIONS: additionsDir,
            CAREER_OPS_BATCH_STATE: path.join(root, 'batch', 'batch-state.tsv'),
          },
          windowsHide: true,
        });
      } catch (error) {
        const failure = classifyFailure(error);
        return { status: failure.status, payload: null, diagnostics: [failure.diagnostic] };
      }
      const merged = findEvaluationRow(trackerPath, row);
      if (!merged) {
        return { status: 'blocked', payload: null, diagnostics: [trackerDiagnostic('TRACKER_DUPLICATE', 'error', 'Merge completed without producing the requested tracker row.')] };
      }
      return {
        status: 'ok', diagnostics: [],
        payload: {
          commandId: command.commandId,
          operation: command.operation,
          resolvedSelector: { row: merged.num, company: merged.company, role: merged.role },
          previousState: null,
          newState: merged.status,
          changedPaths: [path.relative(root, trackerPath).replaceAll('\\', '/')],
          changed: true, mergeStatus: 'merged', derivedIndexRefresh: 'not_requested',
        },
      };
    }
    if (command.operation !== 'transition') {
      return {
        status: 'blocked', payload: null,
        diagnostics: [trackerDiagnostic('TRACKER_OPERATION_UNAVAILABLE', 'error', `${command.operation} is not wired to the compatibility scripts yet.`)],
      };
    }
    const args = [path.join(scriptRoot, 'set-status.mjs')];
    if (command.selector.row != null) args.push('--row', String(command.selector.row));
    else if (command.selector.report != null) args.push('--report', String(command.selector.report));
    else args.push(String(command.selector.company));
    args.push(command.targetState, '--json');
    if (command.selector.role) args.push('--role', command.selector.role);
    if (command.note) args.push('--note', command.note);
    if (command.on) args.push('--on', command.on);
    if (command.expectedPriorState) args.push('--expected-state', command.expectedPriorState);
    try {
      const { stdout } = await run(process.execPath, args, {
        cwd: scriptRoot,
        env: { ...process.env, CAREER_OPS_TRACKER: trackerPath },
        windowsHide: true,
      });
      const result = JSON.parse(String(stdout));
      return {
        status: 'ok',
        payload: {
          commandId: command.commandId,
          operation: command.operation,
          resolvedSelector: { row: result.num, company: result.company, role: result.role },
          previousState: result.oldStatus,
          newState: result.newStatus,
          changedPaths: result.changed ? [path.relative(root, trackerPath).replaceAll('\\', '/')] : [],
          changed: result.changed,
          derivedIndexRefresh: 'not_requested',
        },
        diagnostics: [],
      };
    } catch (error) {
      const failure = classifyFailure(error);
      return { status: failure.status, payload: null, diagnostics: [failure.diagnostic] };
    }
  }

  return { execute };
}
