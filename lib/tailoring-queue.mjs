import { existsSync, readFileSync } from 'fs';
import path from 'path';

import { parsePdfIndex, parseTrackerRows } from '../find.mjs';

function numericScore(value) {
  const match = String(value || '').match(/^(\d+(?:\.\d+)?)\/5$/);
  return match ? Number(match[1]) : null;
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function inspectTailoringQueue(options) {
  const root = path.resolve(options.root);
  const trackerPath = options.trackerPath || path.join(root, 'data', 'applications.md');
  const pdfIndexPath = options.pdfIndexPath || path.join(root, 'data', 'pdf-index.tsv');
  if (!existsSync(trackerPath)) return { ready: [], blocked: [] };
  const rows = parseTrackerRows(readFileSync(trackerPath, 'utf-8'));
  const pdfs = existsSync(pdfIndexPath) ? parsePdfIndex(readFileSync(pdfIndexPath, 'utf-8')) : new Map();
  const ready = [];
  const blocked = [];

  for (const row of rows) {
    const score = numericScore(row.score);
    if (row.status !== 'Evaluated' || score == null || score < options.minScore || !row.reportPath || !row.reportNum || pdfs.has(row.reportNum)) continue;
    const reportPath = path.resolve(root, row.reportPath);
    if (!contained(root, reportPath) || !existsSync(reportPath)) {
      blocked.push({ ...row, reason: 'evaluation report is missing or outside the workspace' });
      continue;
    }
    const report = readFileSync(reportPath, 'utf-8');
    const jdRelativePath = report.match(/^\*\*JD:\*\*\s+(.+?)\s*$/m)?.[1]?.trim();
    const jdPath = jdRelativePath ? path.resolve(root, jdRelativePath) : null;
    if (!jdPath || !contained(root, jdPath) || !existsSync(jdPath)) {
      blocked.push({ ...row, reportPath, reason: 'archived job description is missing' });
      continue;
    }
    ready.push({ ...row, score, reportPath, jdPath, jdRelativePath });
  }
  return { ready: ready.slice(0, options.limit || ready.length), blocked };
}
