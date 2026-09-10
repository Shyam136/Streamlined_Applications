import { classifyReply, matchCandidates } from '../reply-matcher.mjs';
import { parseTrackerRow, resolveColumns } from '../tracker-parse.mjs';

const OUTCOME_RANK = new Map([['Evaluated', 0], ['Applied', 1], ['Responded', 2], ['Interview', 3], ['Offer', 4], ['Hired', 5]]);

export function isSafeAutomaticOutcomeTransition(from, to) {
  if (['Rejected', 'Discarded', 'Hired'].includes(from)) return false;
  if (to === 'Rejected') return ['Evaluated', 'Applied', 'Responded', 'Interview'].includes(from);
  return OUTCOME_RANK.has(from) && OUTCOME_RANK.has(to) && OUTCOME_RANK.get(to) > OUTCOME_RANK.get(from);
}

function trackerApps(text) {
  const lines = String(text || '').split(/\r?\n/);
  const columns = resolveColumns(lines);
  return lines.map((line) => parseTrackerRow(line, columns)).filter(Boolean);
}

export function buildOutcomeReview({ candidates, trackerText, followups = [] }) {
  const apps = trackerApps(trackerText);
  const matches = matchCandidates(Array.isArray(candidates) ? candidates : [], apps, followups);
  const byMessage = new Map((Array.isArray(candidates) ? candidates : []).map((item) => [item.message_id, item]));
  const recommendations = [];
  const unresolved = [];

  for (const match of matches) {
    const candidate = byMessage.get(match.message_id) || {};
    const classification = classifyReply(candidate);
    if (classification.type === 'Noise' || classification.type === 'Auto-confirmation') continue;
    const app = match.application_num == null ? null : apps.find((item) => item.num === match.application_num);
    const target = classification.suggestedTrackerUpdate;
    if (!app || match.confidence !== 'high' || target === 'Needs Review') {
      unresolved.push({ messageId: match.message_id, type: classification.type, confidence: match.confidence, signals: match.signals, companyHint: match.company_hint });
      continue;
    }
    if (target !== 'none' && app.status !== target) {
      recommendations.push({
        messageId: match.message_id, trackerNum: app.num, company: app.company, role: app.role,
        from: app.status, to: target, evidence: classification.evidence,
        automaticEligible: isSafeAutomaticOutcomeTransition(app.status, target),
      });
    }
  }

  const targets = new Map();
  for (const item of recommendations) {
    if (!targets.has(item.trackerNum)) targets.set(item.trackerNum, new Set());
    targets.get(item.trackerNum).add(item.to);
  }
  const conflictingTrackerNums = [...targets].filter(([, states]) => states.size > 1).map(([num]) => num);
  return { recommendations, unresolved, conflictingTrackerNums, needsReview: recommendations.length > 0 || unresolved.length > 0 || conflictingTrackerNums.length > 0 };
}

export async function applyAutomaticOutcomeReview(review, transition) {
  const conflicted = new Set(review.conflictingTrackerNums || []);
  const seen = new Set();
  const results = [];
  let unsafeCount = 0;
  for (const recommendation of review.recommendations || []) {
    const key = `${recommendation.trackerNum}:${recommendation.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (conflicted.has(recommendation.trackerNum) || !recommendation.automaticEligible) {
      unsafeCount++;
      continue;
    }
    results.push(await transition(recommendation));
  }
  const failed = results.filter((result) => result.status !== 'ok');
  return {
    results, failed, unsafeCount,
    unresolvedCount: (review.unresolved?.length || 0) + conflicted.size + failed.length + unsafeCount,
  };
}
