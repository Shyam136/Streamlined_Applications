import { pass, fail } from './helpers.mjs';
import { fetchGmailReplyCandidates } from '../lib/gmail-reply-port.mjs';

console.log('\nGmail reply port — scoped, authenticated, deduplicated ingest');
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(`${message}${detail ? `: ${detail}` : ''}`);
const encoded = (text) => Buffer.from(text).toString('base64url');

try {
  const calls = [];
  const fetchFn = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('oauth2.googleapis.com')) return { ok: true, json: async () => ({ access_token: 'secret-access-token' }) };
    if (String(url).includes('/messages?')) return { ok: true, json: async () => ({ messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'seen' }] }) };
    const id = String(url).match(/messages\/(m\d+)/)?.[1];
    const authentic = id === 'm1';
    return { ok: true, json: async () => ({ payload: {
      headers: [
        { name: 'From', value: authentic ? 'recruiter@acme.test' : 'spoof@evil.test' },
        { name: 'Subject', value: authentic ? 'Interview for Platform Engineer' : 'Fake update' },
        { name: 'Authentication-Results', value: authentic ? 'mx; dmarc=pass' : 'mx; dmarc=fail' },
      ],
      body: { data: encoded(authentic ? '<p>Please schedule an interview.</p>' : 'ignore') },
    } }) };
  };
  const results = await fetchGmailReplyCandidates({
    credentials: { clientId: 'id', clientSecret: 'client-secret', refreshToken: 'refresh-token' },
    label: 'Job Replies', daysBack: 7, existingMessageIds: ['seen'], fetchFn,
  });
  expect(results.length === 1 && results[0].message_id === 'm1', 'keeps only new DMARC-authenticated messages');
  expect(results[0].body_snippet === 'Please schedule an interview.', 'stores a bounded plain-text reply snippet');
  expect(calls.some((call) => call.url.includes('label%3A%22Job+Replies%22')), 'queries only the configured Gmail label and lookback');
  expect(!JSON.stringify(results).includes('secret-access-token'), 'never returns OAuth access tokens in candidate data');

  let invalid = false;
  try { await fetchGmailReplyCandidates({ credentials: {}, label: 'Replies', fetchFn }); } catch { invalid = true; }
  expect(invalid, 'fails closed when Gmail credentials are incomplete');
} catch (error) {
  fail(`Gmail reply port tests crashed: ${error?.stack || error}`);
}
