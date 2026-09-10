import path from 'path';
import yaml from 'js-yaml';

function slug(value, fallback) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

export function deriveTailoringArtifactNames({ profileText, reportPath, reportText, date }) {
  const filename = path.basename(reportPath);
  const reportMatch = filename.match(/^(\d+)-(.+)-(\d{4}-\d{2}-\d{2})\.md$/);
  if (!reportMatch) throw new Error(`Cannot derive tailoring identity from report: ${filename}`);
  let profile = {};
  try { profile = yaml.load(profileText) || {}; } catch { /* validated by the caller */ }
  const reportNum = reportMatch[1];
  const companySlug = slug(reportMatch[2], 'unknown-company');
  const roleMatch = String(reportText || '').match(/^#\s+Evaluation:\s+.+?\s+-\s+(.+?)$/m);
  const roleSlug = slug(roleMatch?.[1], 'role');
  const candidateSlug = slug(profile.name || profile.candidate?.full_name, 'candidate');
  const artifactDate = date || new Date().toISOString().slice(0, 10);
  return {
    reportNum,
    htmlPath: `output/cv-${candidateSlug}-${companySlug}-${reportNum}.html`,
    pdfPath: `output/cv-${candidateSlug}-${companySlug}-${roleSlug}-${reportNum}-${artifactDate}.pdf`,
  };
}
