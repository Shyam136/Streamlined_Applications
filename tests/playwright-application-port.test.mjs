import http from 'http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { pass, fail } from './helpers.mjs';
import { buildApplicationFillPlan } from '../lib/application-form.mjs';
import { createPlaywrightApplicationPort } from '../lib/playwright-application-port.mjs';

console.log('\nPlaywright application port — local form integration');
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(`${message}${detail ? `: ${detail}` : ''}`);
const sandbox = mkdtempSync(path.join(tmpdir(), 'career-ops-playwright-application-'));
mkdirSync(path.join(sandbox, 'output'));
writeFileSync(path.join(sandbox, 'output', 'cv.pdf'), 'fixture-pdf');

const server = http.createServer((request, response) => {
  if (request.url === '/redirect') {
    response.writeHead(302, { location: `http://localhost:${server.address().port}/apply` });
    response.end();
    return;
  }
  if (request.url === '/detail') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><html><body><h1>Platform Engineer</h1><a href="/apply">Apply for this job</a></body></html>');
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(`<!doctype html><html><body>
    <form id="application"><label for="first">First name</label><input id="first" name="first_name" required>
    <label for="email">Email</label><input id="email" name="email" type="email" required>
    <label for="resume">Resume</label><input id="resume" name="resume" type="file" required style="display:none">
    <fieldset><legend>Preferred work mode</legend><label><input name="work_mode" type="radio" value="remote" required>Remote</label><label><input name="work_mode" type="radio" value="onsite">On-site</label></fieldset>
    <button type="submit">Submit application</button></form>
    <script>document.querySelector('form').addEventListener('submit', e => { e.preventDefault(); document.body.innerHTML='<main>Thank you for applying. Application received.</main>'; });</script>
  </body></html>`);
});

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/apply`;
  const port = createPlaywrightApplicationPort({ root: sandbox, allowedHosts: ['127.0.0.1'], confirmationWaitMs: 50, allowLocal: true });
  const form = await port.inspect(url);
  expect(form.fields.length === 4 && form.fields.find((field) => field.name === 'work_mode')?.options.length === 2 && !form.captcha, 'inspects visible semantic fields and groups radio options');
  const plan = buildApplicationFillPlan(form, { firstName: 'Jane', email: 'jane@example.test', resumePath: 'output/cv.pdf', fields: { work_mode: 'Remote' } });
  const filled = await port.fill(plan);
  expect(filled.filled === 4, 'fills text fields, a selected radio option, and the approved resume');
  let escaped = false;
  try { await port.fill({ actions: [{ action: 'upload', fieldId: 'resume', name: 'resume', value: '../outside.pdf' }] }); }
  catch (error) { escaped = /outside the workspace/.test(error.message); }
  expect(escaped, 'rejects upload paths outside the workspace');
  const result = await port.submit();
  expect(result.confirmed && /thank you for applying|application received/i.test(result.marker), 'clicks the unique final control and requires confirmation evidence');
  await port.close();

  const redirectPort = createPlaywrightApplicationPort({ root: sandbox, allowedHosts: ['127.0.0.1'], allowLocal: true });
  let redirected = false;
  try { await redirectPort.inspect(`http://127.0.0.1:${address.port}/redirect`); }
  catch (error) { redirected = /not allowlisted/.test(error.message); }
  finally { await redirectPort.close(); }
  expect(redirected, 'rejects navigation that redirects to a non-allowlisted host');

  const detailPort = createPlaywrightApplicationPort({ root: sandbox, allowedHosts: ['127.0.0.1'], allowLocal: true });
  const navigated = await detailPort.inspect(`http://127.0.0.1:${address.port}/detail`);
  expect(navigated.fields.length === 4 && navigated.url.endsWith('/apply'), 'follows one unambiguous allowlisted Apply link to the actual form');
  await detailPort.close();
} catch (error) {
  fail(`Playwright application integration crashed: ${error?.stack || error}`);
} finally {
  server.close();
  rmSync(sandbox, { recursive: true, force: true });
}
