import { getMessageBody, isAuthenticEmail } from '../plugins/gmail/_helpers.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function jsonRequest(fetchFn, url, options = {}) {
  const response = await fetchFn(url, options);
  if (!response.ok) throw new Error(`Gmail request failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

function header(headers, name) {
  return (headers || []).find((item) => item.name?.toLowerCase() === name)?.value || '';
}

function plainSnippet(payload) {
  return getMessageBody(payload)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim().slice(0, 4000);
}

export async function fetchGmailReplyCandidates(options) {
  const fetchFn = options.fetchFn || globalThis.fetch;
  const credentials = options.credentials || {};
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) throw new Error('Gmail reply ingest requires clientId, clientSecret, and refreshToken.');
  const label = String(options.label || '').trim();
  if (!label || /[\r\n"]/.test(label)) throw new Error('Gmail reply label must be a non-empty single-line value without quotes.');
  const daysBack = Number(options.daysBack ?? 14);
  if (!Number.isInteger(daysBack) || daysBack < 1 || daysBack > 365) throw new Error('Gmail reply daysBack must be an integer from 1 to 365.');

  const tokenData = await jsonRequest(fetchFn, TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken, grant_type: 'refresh_token' }),
  });
  if (!tokenData.access_token) throw new Error('Gmail token refresh returned no access_token.');
  const headers = { authorization: `Bearer ${tokenData.access_token}` };
  const ids = [];
  let pageToken = '';
  let pages = 0;
  do {
    const query = `label:"${label}" newer_than:${daysBack}d`;
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set('q', query);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await jsonRequest(fetchFn, url.href, { headers });
    ids.push(...(data.messages || []).map((item) => item.id).filter(Boolean));
    pageToken = data.nextPageToken || '';
    pages++;
    if (pages >= 10 && pageToken) throw new Error('Gmail reply ingest exceeded its 10-page safety limit; narrow the label or lookback.');
  } while (pageToken);

  const existing = new Set(options.existingMessageIds || []);
  const candidates = [];
  for (const id of ids) {
    if (existing.has(id)) continue;
    const message = await jsonRequest(fetchFn, `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`, { headers });
    const messageHeaders = message.payload?.headers || [];
    if (!isAuthenticEmail(messageHeaders)) continue;
    candidates.push({
      message_id: id,
      from: header(messageHeaders, 'from'),
      subject: header(messageHeaders, 'subject'),
      body_snippet: plainSnippet(message.payload),
      signal: null,
    });
  }
  return candidates;
}
