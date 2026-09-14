import { existsSync, readFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

import { parsePdfIndex, parseTrackerRows } from '../find.mjs';

function numericScore(value) {
  const match = String(value || '').match(/^(\d+(?:\.\d+)?)\/5$/);
  return match ? Number(match[1]) : null;
}

function normalizedPostingUrl(raw) {
  try {
    const url = new URL(String(raw || ''));
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/application\/?$/i, '').replace(/\/$/, '');
    return url.href;
  } catch {
    return String(raw || '').trim();
  }
}

function loadPublishedDates(root) {
  const historyPath = path.join(root, 'data', 'scan-history.tsv');
  if (!existsSync(historyPath)) return new Map();
  const lines = readFileSync(historyPath, 'utf-8').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return new Map();
  const header = lines[0].split('\t');
  const urlIndex = header.indexOf('url');
  const postedIndex = header.indexOf('posted_at');
  if (urlIndex < 0 || postedIndex < 0) return new Map();
  const dates = new Map();
  for (const line of lines.slice(1)) {
    const columns = line.split('\t');
    const postedAt = Date.parse(columns[postedIndex] || '');
    if (Number.isFinite(postedAt)) dates.set(normalizedPostingUrl(columns[urlIndex]), postedAt);
  }
  return dates;
}

export function buildApplicationQueue(options) {
  const root = options.root;
  const trackerPath = options.trackerPath || path.join(root, 'data', 'applications.md');
  const pdfIndexPath = options.pdfIndexPath || path.join(root, 'data', 'pdf-index.tsv');
  if (!existsSync(trackerPath)) return [];
  const rows = parseTrackerRows(readFileSync(trackerPath, 'utf-8'));
  const pdfs = existsSync(pdfIndexPath) ? parsePdfIndex(readFileSync(pdfIndexPath, 'utf-8')) : new Map();
  const publishedDates = loadPublishedDates(root);
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
    queue.push({
      ...row, score, applyUrl, reportPath, pdfPath, pdfRelativePath: pdfRel,
      postedAt: publishedDates.get(normalizedPostingUrl(applyUrl)) ?? null,
    });
  }
  queue.sort((a, b) => {
    if (a.postedAt != null && b.postedAt != null && a.postedAt !== b.postedAt) return b.postedAt - a.postedAt;
    if (a.postedAt != null) return -1;
    if (b.postedAt != null) return 1;
    const trackerDateDiff = Date.parse(b.date || '') - Date.parse(a.date || '');
    if (Number.isFinite(trackerDateDiff) && trackerDateDiff !== 0) return trackerDateDiff;
    return Number(b.reportNum || 0) - Number(a.reportNum || 0);
  });
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
