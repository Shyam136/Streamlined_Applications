import { pass, fail } from './helpers.mjs';
import { applyAutomaticOutcomeReview, buildOutcomeReview, isSafeAutomaticOutcomeTransition } from '../lib/outcome-review.mjs';

console.log('\nOutcome review — continuous reply classification');
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(`${message}${detail ? `: ${detail}` : ''}`);
const trackerText = `| # | Date | Company | Role | Status | Score | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n| 1 | 2026-09-10 | Acme Corp | Software Engineer | Applied | 4.5/5 | ✅ | [001](reports/001-acme.md) | |\n`;

try {
  const interview = buildOutcomeReview({ trackerText, candidates: [{ message_id: 'i1', from: 'recruiter@acmecorp.com', subject: 'Interview for Software Engineer at Acme Corp', body_snippet: 'Please schedule an interview.', signal: 'interview_invite' }] });
  expect(interview.needsReview && interview.recommendations[0]?.to === 'Interview', 'surfaces a high-confidence tracker transition for review');

  const alreadyTracked = buildOutcomeReview({ trackerText: trackerText.replace('Applied', 'Interview'), candidates: [{ message_id: 'i1', from: 'recruiter@acmecorp.com', subject: 'Interview for Software Engineer at Acme Corp', body_snippet: 'Please schedule an interview.', signal: 'interview_invite' }] });
  expect(!alreadyTracked.needsReview, 'does not repeatedly flag an outcome already in the tracker');

  const ambiguous = buildOutcomeReview({ trackerText, candidates: [{ message_id: 'u1', from: 'recruiter@unknown.example', subject: 'Application update', body_snippet: 'We would like to chat.', signal: 'update' }] });
  expect(ambiguous.unresolved.length === 1 && ambiguous.needsReview, 'keeps unmatched recruiting replies for human resolution');

  const noise = buildOutcomeReview({ trackerText, candidates: [{ message_id: 'n1', from: 'alerts@jobs.example', subject: 'Job alert', body_snippet: 'Recommended jobs', signal: null }] });
  expect(!noise.needsReview, 'ignores job-alert noise');
  expect(isSafeAutomaticOutcomeTransition('Applied', 'Interview') && isSafeAutomaticOutcomeTransition('Interview', 'Rejected'), 'allows forward progress and rejection from an active process');
  expect(!isSafeAutomaticOutcomeTransition('Rejected', 'Interview') && !isSafeAutomaticOutcomeTransition('Offer', 'Responded') && !isSafeAutomaticOutcomeTransition('Offer', 'Rejected'), 'refuses terminal revival and backward or ambiguous late transitions');

  const applied = [];
  const mixed = await applyAutomaticOutcomeReview({
    recommendations: [
      { trackerNum: 1, to: 'Interview', automaticEligible: true },
      { trackerNum: 1, to: 'Interview', automaticEligible: true },
      { trackerNum: 2, to: 'Responded', automaticEligible: false },
    ], unresolved: [], conflictingTrackerNums: [],
  }, async (item) => { applied.push(item); return { status: 'ok' }; });
  expect(applied.length === 1 && mixed.results.length === 1, 'automatic outcome application deduplicates identical transitions');
  expect(mixed.unresolvedCount === 1, 'unsafe automatic transitions remain explicit review items');
} catch (error) {
  fail(`outcome review tests crashed: ${error?.stack || error}`);
}
