import { existsSync } from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { rejectPrivateOrInvalid, validateUrlSecurity } from '../liveness-browser.mjs';

const CONFIRMATION_RE = /\b(application (?:has been )?(?:received|submitted)|thank you for applying|successfully submitted|we(?:'|’)ve received your application)\b/i;

function safeUrl(raw, allowedHosts) {
  const url = new URL(raw);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('Application URL must use HTTPS.');
  if (allowedHosts?.length && !allowedHosts.includes(url.hostname)) throw new Error(`Application host is not allowlisted: ${url.hostname}`);
  return url;
}

function isLoopback(raw) {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(raw).hostname); }
  catch { return false; }
}

export function createPlaywrightApplicationPort(options = {}) {
  const allowedHosts = options.allowedHosts || [];
  const root = options.root || process.cwd();
  let browser = null;
  let context = null;
  let page = null;

  async function ensurePage() {
    if (page) return page;
    browser = await chromium.launch({ headless: options.headless !== false });
    const contextOptions = {};
    if (options.storageState && existsSync(options.storageState)) contextOptions.storageState = options.storageState;
    context = await browser.newContext(contextOptions);
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (options.allowLocal === true && isLoopback(requestUrl)) return route.continue();
      const guard = rejectPrivateOrInvalid(requestUrl);
      if (guard) return route.abort('blockedbyclient');
      try { await validateUrlSecurity(requestUrl); return route.continue(); }
      catch { return route.abort('blockedbyclient'); }
    });
    page = await context.newPage();
    return page;
  }

  async function inspect(rawUrl) {
    const url = safeUrl(rawUrl, allowedHosts);
    const activePage = await ensurePage();
    await activePage.goto(url.href, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || 30_000 });
    await activePage.waitForLoadState('networkidle', { timeout: options.formWaitMs || 10_000 }).catch(() => {});
    safeUrl(activePage.url(), allowedHosts);
    const fieldCount = await activePage.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select').count();
    if (fieldCount === 0) {
      const applyLinks = activePage.locator('a:visible');
      const hrefs = new Set();
      for (let index = 0; index < await applyLinks.count(); index++) {
        const text = (await applyLinks.nth(index).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        const href = await applyLinks.nth(index).getAttribute('href');
        if (href && (/\b(apply|application)\b/i.test(text) || /\/application(?:[/?#]|$)/i.test(href))) {
          hrefs.add(new URL(href, activePage.url()).href);
        }
      }
      if (hrefs.size === 1) {
        const applyUrl = safeUrl([...hrefs][0], allowedHosts);
        await activePage.goto(applyUrl.href, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || 30_000 });
        safeUrl(activePage.url(), allowedHosts);
        await activePage.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select')
          .first().waitFor({ state: 'attached', timeout: options.formWaitMs || 10_000 }).catch(() => {});
      }
    }
    const model = await activePage.evaluate(() => {
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const labelFor = (el) => {
        if (el.labels?.length) return [...el.labels].map((label) => label.innerText).join(' ').trim();
        return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id || '';
      };
      const elements = [...document.querySelectorAll('input, textarea, select')]
        .filter((el) => (visible(el) || (el.type || '').toLowerCase() === 'file') && !['hidden', 'submit', 'button', 'reset'].includes((el.type || '').toLowerCase()));
      const fields = [];
      const radioGroups = new Set();
      for (let index = 0; index < elements.length; index++) {
        const el = elements[index];
        const type = (el.type || el.tagName).toLowerCase();
        const name = el.name || el.id || `field-${index}`;
        if (type === 'radio') {
          if (radioGroups.has(name)) continue;
          radioGroups.add(name);
          const members = elements.filter((candidate) => (candidate.type || '').toLowerCase() === 'radio' && (candidate.name || candidate.id) === name);
          const legend = el.closest('fieldset')?.querySelector('legend')?.innerText?.trim();
          fields.push({
            id: el.id || `career-ops-field-${index}`, name, label: legend || el.getAttribute('aria-label') || name,
            tag: 'input', type: 'radio', required: members.some((member) => member.required || member.getAttribute('aria-required') === 'true'),
            options: members.map((member) => ({ label: labelFor(member), value: member.value })),
          });
          continue;
        }
        fields.push({
          id: el.id || `career-ops-field-${index}`, name,
          label: labelFor(el), tag: el.tagName.toLowerCase(), type,
          required: Boolean(el.required || el.getAttribute('aria-required') === 'true'),
          options: el.tagName.toLowerCase() === 'select'
            ? [...el.options].map((option) => ({ label: option.textContent.trim(), value: option.value })).filter((option) => option.value || option.label)
            : undefined,
        });
      }
      const captcha = Boolean(document.querySelector('[class*="captcha" i], [id*="captcha" i], iframe[src*="captcha" i], textarea[name*="captcha" i]'));
      return { url: location.href, title: document.title, fields, captcha, markers: captcha ? ['captcha'] : [] };
    });
    return model;
  }

  async function fieldLocator(action) {
    const activePage = await ensurePage();
    if (action.fieldType === 'radio') {
      const radio = activePage.locator(`[name=${JSON.stringify(action.name)}][value=${JSON.stringify(String(action.value))}]`);
      if (await radio.count() === 1) return radio;
      throw new Error(`Radio option disappeared before fill: ${action.name}=${action.value}`);
    }
    if (action.fieldId && !action.fieldId.startsWith('career-ops-field-')) {
      const byId = activePage.locator(`[id=${JSON.stringify(action.fieldId)}]`);
      if (await byId.count()) return byId.first();
    }
    const byName = activePage.locator(`[name=${JSON.stringify(action.name)}]`);
    if (await byName.count()) return byName.first();
    throw new Error(`Field disappeared before fill: ${action.name}`);
  }

  async function fill(plan) {
    for (const action of plan.actions) {
      const locator = await fieldLocator(action);
      if (action.action === 'upload') {
        const upload = path.resolve(root, String(action.value));
        const relative = path.relative(path.resolve(root), upload);
        if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Upload file is outside the workspace: ${action.value}`);
        if (!existsSync(upload)) throw new Error(`Upload file is missing: ${action.value}`);
        await locator.setInputFiles(upload);
      } else if (action.action === 'select') await locator.selectOption({ label: String(action.value) }).catch(() => locator.selectOption(String(action.value)));
      else if (action.action === 'check') {
        if (typeof action.value === 'boolean') { if (action.value) await locator.check(); else await locator.uncheck(); }
        else await locator.check();
      } else await locator.fill(String(action.value));
    }
    return { filled: plan.actions.length };
  }

  async function prepareSubmit() {
    const activePage = await ensurePage();
    const candidates = activePage.locator('button[type="submit"]:visible, form button:not([type]):visible, input[type="submit"]:visible');
    const count = await candidates.count();
    if (count !== 1) return { ready: false, reason: count === 0 ? 'submit control not found' : 'multiple submit controls found' };
    const control = candidates.first();
    const label = (await control.innerText().catch(() => '') || await control.getAttribute('value') || '').trim();
    if (!/\b(submit|send|apply|complete application)\b/i.test(label)) return { ready: false, reason: `ambiguous final control: ${label}` };
    const actionUrl = await control.evaluate((element) => element.formAction || element.form?.action || location.href);
    safeUrl(actionUrl, allowedHosts);
    return { ready: true, label, actionUrl };
  }

  async function submit(prepared = null) {
    const activePage = await ensurePage();
    const readiness = prepared?.ready ? prepared : await prepareSubmit();
    if (!readiness.ready) return { attempted: false, confirmed: false, reason: readiness.reason };
    const candidates = activePage.locator('button[type="submit"]:visible, form button:not([type]):visible, input[type="submit"]:visible');
    if (await candidates.count() !== 1) return { attempted: false, confirmed: false, reason: 'final control changed before submission' };
    const control = candidates.first();
    await control.click();
    await activePage.waitForTimeout(options.confirmationWaitMs || 750);
    const body = await activePage.locator('body').innerText().catch(() => '');
    safeUrl(activePage.url(), allowedHosts);
    const marker = body.match(CONFIRMATION_RE)?.[0] || null;
    return { attempted: true, confirmed: Boolean(marker), url: activePage.url(), marker, reason: marker ? null : 'confirmation marker not found' };
  }

  async function close() {
    try { await context?.close(); } finally { await browser?.close().catch(() => {}); context = null; browser = null; page = null; }
  }

  return { inspect, fill, prepareSubmit, submit, close };
}
