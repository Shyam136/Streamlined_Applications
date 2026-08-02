import { stableHash, makeDiagnostic, makePortResult, DISCOVERY_SCHEMA_VERSION } from './discovery-contracts.mjs';

const DEFAULT_MAX_DESCRIPTION_CHARS = 500_000;
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?previous\s+instructions/i,
  /(?:^|\n)\s*(?:system|assistant|developer)\s*:/i,
  /<\/?(?:system|assistant|developer|tool)[^>]*>/i,
  /(?:call|invoke|execute)\s+(?:this\s+)?tool/i,
];

function scalar(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\u0000/g, '').trim();
  return text || null;
}

function explicitDate(value) {
  if (value == null || value === '') return null;
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeCompensation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const explicitNumber = (raw) => raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw))
    ? Number(raw)
    : null;
  const min = explicitNumber(value.min);
  const max = explicitNumber(value.max);
  const currency = scalar(value.currency);
  const period = scalar(value.period);
  const text = scalar(value.text || value.display);
  if (min == null && max == null && currency == null && period == null && text == null) return null;
  return { min, max, currency, period, text };
}

function explicitWorkplace(raw) {
  const named = scalar(raw.workplaceType || raw.workplace || raw.remoteType);
  if (named) return named.toLowerCase();
  if (raw.remote === true) return 'remote';
  if (raw.hybrid === true) return 'hybrid';
  if (raw.onsite === true || raw.onSite === true) return 'on-site';
  return null;
}

function postingId(raw) {
  for (const value of [raw.postingId, raw.requisitionId, raw.jobId, raw.id, raw.reqId]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function unsafeUrlReason(value) {
  if (typeof value !== 'string' || !value.trim()) return 'missing';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'unsupported_protocol';
  } catch {
    return 'invalid';
  }
}

export function containsUntrustedInstruction(value) {
  if (typeof value !== 'string') return false;
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

export function normalizePosting(raw, context = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return makePortResult('blocked', null, [
      makeDiagnostic('JOB_SOURCE_SCHEMA', 'error', 'Job-source item must be an object.'),
    ]);
  }

  let rawJson;
  try {
    rawJson = JSON.stringify(raw);
  } catch {
    return makePortResult('blocked', null, [
      makeDiagnostic('JOB_SOURCE_SCHEMA', 'error', 'Job-source item is not serialization-safe.'),
    ]);
  }

  const maxDescriptionChars = context.maxDescriptionChars ?? DEFAULT_MAX_DESCRIPTION_CHARS;
  const description = scalar(raw.description || raw.descriptionPlain || raw.content || raw.summary);
  if (description && description.length > maxDescriptionChars) {
    return makePortResult('blocked', null, [
      makeDiagnostic('JOB_SOURCE_PAYLOAD_TOO_LARGE', 'error', 'Job description exceeds the configured size limit.'),
    ]);
  }

  const urlReason = unsafeUrlReason(raw.url || raw.absolute_url || raw.applyUrl);
  if (urlReason) {
    const code = urlReason === 'missing' ? 'POSTING_URL_MISSING' : 'POSTING_URL_INVALID';
    return makePortResult('needs_review', null, [
      makeDiagnostic(code, 'warning', 'Posting has no safe canonical HTTP(S) URL.'),
    ]);
  }

  const title = scalar(raw.title || raw.name);
  if (!title) {
    return makePortResult('needs_review', null, [
      makeDiagnostic('POSTING_TITLE_MISSING', 'warning', 'Posting title is missing.'),
    ]);
  }

  const company = scalar(raw.company) || scalar(context.defaultCompany);
  const canonicalUrl = String(raw.url || raw.absolute_url || raw.applyUrl).trim();
  const id = postingId(raw);
  const discoveredAt = context.discoveredAt || new Date().toISOString();
  const diagnostics = [];
  if (containsUntrustedInstruction(description)) {
    diagnostics.push(makeDiagnostic(
      'UNTRUSTED_CONTENT_ANOMALY',
      'warning',
      'Posting contains instruction-like text; it remains untrusted data.',
      { refs: [canonicalUrl] },
    ));
  }

  const missingFields = [];
  if (!company) missingFields.push('company');
  if (!scalar(raw.location)) missingFields.push('location');
  if (!id) missingFields.push('postingId');
  if (!explicitDate(firstPresent(raw.postedAt, raw.publishedAt, raw.published_at, raw.createdAt))) missingFields.push('publishedAt');
  if (!normalizeCompensation(raw.salary || raw.compensation)) missingFields.push('compensation');

  const normalized = {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    normalizationVersion: DISCOVERY_SCHEMA_VERSION,
    jobSourceAdapter: scalar(context.adapterId) || 'unknown',
    sourceName: scalar(context.sourceName),
    company,
    title,
    canonicalUrl,
    postingId: id,
    postingIdentity: {
      jobSourceAdapter: scalar(context.adapterId) || 'unknown',
      postingId: id,
      canonicalUrl,
      companyRoleFallback: `${(company || '').toLowerCase()}::${title.toLowerCase()}`,
    },
    location: scalar(raw.location),
    workplaceType: explicitWorkplace(raw),
    employmentType: scalar(raw.employmentType || raw.employment_type || raw.type),
    publishedAt: explicitDate(firstPresent(raw.postedAt, raw.publishedAt, raw.published_at, raw.createdAt)),
    updatedAt: explicitDate(firstPresent(raw.updatedAt, raw.updated_at)),
    compensation: normalizeCompensation(raw.salary || raw.compensation),
    rawDescription: description,
    discoveredAt,
    freshnessProbe: {
      schemaVersion: DISCOVERY_SCHEMA_VERSION,
      status: 'active',
      method: 'job-source-list',
      timestamp: discoveredAt,
      evidence: `Present in ${scalar(context.adapterId) || 'job-source'} list response`,
      authoritative: false,
    },
    rawSourceRef: {
      kind: 'job-source-item',
      source: scalar(context.sourceName),
      adapter: scalar(context.adapterId) || 'unknown',
      checksum: stableHash(rawJson),
      retrievedAt: discoveredAt,
      trust: 'untrusted-external',
    },
    diagnostics,
    missingFields,
  };

  return makePortResult('ok', normalized, diagnostics);
}

export function toLegacyOffer(posting) {
  return {
    title: posting.title,
    url: posting.canonicalUrl,
    company: posting.company || '',
    location: posting.location || '',
    description: posting.rawDescription || undefined,
    postedAt: posting.publishedAt ? Date.parse(posting.publishedAt) : undefined,
    salary: posting.compensation || undefined,
    source: posting.sourceName || posting.jobSourceAdapter,
  };
}
