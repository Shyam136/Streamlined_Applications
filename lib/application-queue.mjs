import { existsSync, readFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

import { parsePdfIndex, parseTrackerRows } from '../find.mjs';

function numericScore(value) {
  const match = String(value || '').match(/^(\d+(?:\.\d+)?)\/5$/);
  return match ? Number(match[1]) : null;
}

export function buildApplicationQueue(options) {
  const root = options.root;
  const trackerPath = options.trackerPath || path.join(root, 'data', 'applications.md');
  const pdfIndexPath = options.pdfIndexPath || path.join(root, 'data', 'pdf-index.tsv');
  if (!existsSync(trackerPath)) return [];
  const rows = parseTrackerRows(readFileSync(trackerPath, 'utf-8'));
  const pdfs = existsSync(pdfIndexPath) ? parsePdfIndex(readFileSync(pdfIndexPath, 'utf-8')) : new Map();
  const queue = [];
  for (const row of rows) {
    const score = numericScore(row.score);
    if (row.status !== 'Evaluated' || score == null || score < options.minScore || !row.reportPath || !row.reportNum) continue;
    const reportPath = path.resolve(root, row.reportPath);
    const pdfRel = pdfs.get(row.reportNum);
    const pdfPath = pdfRel ? path.resolve(root, pdfRel) : null;
    if (!existsSync(reportPath) || !pdfPath || !existsSync(pdfPath)) continue;
    const report = readFileSync(reportPath, 'utf-8');
    const applyUrl = report.match(/^\*\*URL:\*\*\s*(https?:\/\/\S+)/m)?.[1]?.replace(/[)>.,]+$/, '') || null;
    if (!applyUrl) continue;
    queue.push({ ...row, score, applyUrl, reportPath, pdfPath, pdfRelativePath: pdfRel });
  }
  return queue.slice(0, options.limit || queue.length);
}

export function loadVerifiedApplicationValues(root) {
  const profilePath = path.join(root, 'config', 'profile.yml');
  if (!existsSync(profilePath)) return {};
  const profile = yaml.load(readFileSync(profilePath, 'utf-8')) || {};
  const candidate = profile.candidate || {};
  const fullName = String(candidate.full_name || '').trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    fullName,
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
    email: candidate.email || '', phone: candidate.phone || '', location: candidate.location || '',
    linkedin: candidate.linkedin || '', portfolioUrl: candidate.portfolio_url || '',
    fields: profile.application_answers?.fields || {},
  };
}
