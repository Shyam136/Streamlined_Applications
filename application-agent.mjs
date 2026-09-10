import path from 'path';
import { fileURLToPath } from 'url';

import { applicationDiagnostic, makeApplicationResult, submissionActionId, validateApplicationTask } from './lib/application-contracts.mjs';
import { buildApplicationFillPlan } from './lib/application-form.mjs';
import { createSubmissionLedger } from './lib/submission-ledger.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export function createApplicationAgent(options = {}) {
  const browser = options.browser;
  const tracker = options.tracker;
  const ledger = options.ledger || createSubmissionLedger(path.join(options.root || ROOT, 'data', 'submission-ledger.json'));
  const now = options.now || (() => new Date().toISOString());
  const clock = options.clock || (() => Date.now());

  async function apply(task) {
    const startedAt = now();
    const startedMs = clock();
    const finish = (status, payload, diagnostics, effects = {}) => makeApplicationResult(task, status, payload, diagnostics, {
      startedAt, completedAt: now(), durationMs: Math.max(0, clock() - startedMs),
    }, effects);
    const errors = validateApplicationTask(task);
    if (errors.length) return finish('blocked', null, errors);
    if (!browser || typeof browser.inspect !== 'function' || typeof browser.fill !== 'function') return finish('blocked', null, [applicationDiagnostic('BROWSER_ADAPTER_UNAVAILABLE', 'error', 'Browser application adapter is unavailable.')]);
    const input = task.input;
    const actionId = submissionActionId(input);
    const prior = ledger.get(actionId);
    if (prior?.status === 'confirmed') {
      let trackerResult = null;
      if (typeof tracker === 'function') trackerResult = await tracker({ selector: input.trackerSelector, targetState: 'Applied', expectedPriorState: null, note: `automatic submission ${actionId.slice(0, 12)}` });
      if (trackerResult && trackerResult.status !== 'ok') {
        return finish('needs_review', { actionId, replay: true, submitted: true, submittedThisRun: false, evidence: prior.evidence, trackerResult }, [applicationDiagnostic('TRACKER_UPDATE_FAILED', 'warning', 'The submission is confirmed, but tracker reconciliation still requires attention.')]);
      }
      return finish('ok', { actionId, replay: true, submitted: true, submittedThisRun: false, evidence: prior.evidence, trackerResult }, [], { committed: trackerResult?.committedSideEffects || [] });
    }
    if (prior) return finish('needs_review', { actionId, replay: true, submitted: false }, [applicationDiagnostic('SUBMISSION_STATE_AMBIGUOUS', 'warning', 'A prior submission intent exists without confirmed completion; automatic retry is refused.')]);

    let form;
    try { form = await browser.inspect(input.applyUrl); }
    catch (error) { return finish('retryable_failure', null, [applicationDiagnostic('FORM_INSPECTION_FAILED', 'error', error.message, { retryable: true })], { retry: { safe: true } }); }
    const closeBrowser = async () => { try { await browser.close?.(); } catch { /* best-effort cleanup */ } };
    const plan = buildApplicationFillPlan(form, input.verifiedValues, { approvedSensitiveFields: input.policy.approvedSensitiveFields });
    if (plan.captcha) { await closeBrowser(); return finish('needs_review', { actionId, plan, submitted: false }, [applicationDiagnostic('CAPTCHA_REQUIRED', 'warning', 'CAPTCHA detected; user action is required.')]); }
    if (!plan.canSubmit) { await closeBrowser(); return finish('needs_review', { actionId, plan, submitted: false }, [applicationDiagnostic('REQUIRED_FIELDS_UNRESOLVED', 'warning', 'Required fields lack verified approved values.', { details: plan.unresolved })]); }
    try { await browser.fill(plan); }
    catch (error) { await closeBrowser(); return finish('retryable_failure', { actionId, plan, submitted: false }, [applicationDiagnostic('FORM_FILL_FAILED', 'error', error.message, { retryable: true })], { retry: { safe: true } }); }
    if (input.policy.mode === 'review') { await closeBrowser(); return finish('needs_review', { actionId, plan, submitted: false, filled: true }, [applicationDiagnostic('HUMAN_APPROVAL_REQUIRED', 'info', 'Form values were prepared and validated; use the returned plan for review.')]); }
    if (typeof browser.submit !== 'function') { await closeBrowser(); return finish('blocked', { actionId, plan, submitted: false }, [applicationDiagnostic('SUBMISSION_ADAPTER_UNAVAILABLE', 'error', 'Browser adapter cannot submit.')]); }

    let preparedSubmit = null;
    if (typeof browser.prepareSubmit === 'function') {
      try { preparedSubmit = await browser.prepareSubmit(); }
      catch (error) { await closeBrowser(); return finish('needs_review', { actionId, plan, submitted: false }, [applicationDiagnostic('SUBMISSION_CONTROL_UNRESOLVED', 'warning', error.message)]); }
      if (!preparedSubmit?.ready) {
        await closeBrowser();
        return finish('needs_review', { actionId, plan, submitted: false }, [applicationDiagnostic('SUBMISSION_CONTROL_UNRESOLVED', 'warning', preparedSubmit?.reason || 'A unique final submission control was not found.')]);
      }
    }

    ledger.begin(actionId, { applyUrl: input.applyUrl, trackerSelector: input.trackerSelector });
    let submitted;
    try { submitted = await browser.submit(preparedSubmit); }
    catch (error) {
      ledger.uncertain(actionId, error.message);
      await closeBrowser();
      return finish('needs_review', { actionId, plan, submitted: false }, [applicationDiagnostic('SUBMISSION_STATE_AMBIGUOUS', 'warning', 'Submission failed after intent was recorded; inspect the ATS before retrying.')]);
    }
    if (!submitted?.confirmed) {
      ledger.uncertain(actionId, submitted?.reason || 'confirmation evidence missing');
      await closeBrowser();
      return finish('needs_review', { actionId, plan, submitted: false }, [applicationDiagnostic('SUBMISSION_UNCONFIRMED', 'warning', 'The ATS did not provide reliable submission confirmation.')]);
    }
    ledger.complete(actionId, { url: submitted.url || input.applyUrl, marker: submitted.marker || 'confirmed' });
    let trackerResult = null;
    if (typeof tracker === 'function') {
      trackerResult = await tracker({ selector: input.trackerSelector, targetState: 'Applied', expectedPriorState: 'Evaluated', note: `automatic submission ${actionId.slice(0, 12)}` });
    }
    const diagnostics = trackerResult && trackerResult.status !== 'ok'
      ? [applicationDiagnostic('TRACKER_UPDATE_FAILED', 'warning', 'Submission was confirmed but tracker update requires reconciliation.', { details: { actionId } })]
      : [];
    await closeBrowser();
    return finish('ok', { actionId, plan, submitted: true, submittedThisRun: true, evidence: submitted, trackerResult }, diagnostics, {
      requested: task.requestedSideEffects || [],
      committed: [{ type: 'external_submission', host: new URL(input.applyUrl).hostname, actionId }, ...(trackerResult?.committedSideEffects || [])],
    });
  }
  return { apply };
}
