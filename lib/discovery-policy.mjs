import { normalizeCompany } from '../tracker-utils.mjs';
import { makeDiagnostic, makePortResult, DISCOVERY_SCHEMA_VERSION } from './discovery-contracts.mjs';
import { toLegacyOffer } from './discovery-normalize.mjs';

function strings(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
}

function profileTargetKeywords(profile) {
  const roles = profile?.target_roles;
  if (!roles || typeof roles !== 'object') return [];
  return [...new Set([
    ...strings(roles.primary),
    ...(Array.isArray(roles.archetypes)
      ? roles.archetypes.map((item) => typeof item?.name === 'string' ? item.name.trim() : '').filter(Boolean)
      : []),
  ])];
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || null;
}

function titlePolicy(portalConfig, profileConfig, requestFilters, targetLanePolicy) {
  const configured = firstObject(
    requestFilters.title_filter,
    requestFilters.title,
    portalConfig.title_filter,
    targetLanePolicy?.title_filter,
    targetLanePolicy?.positive ? targetLanePolicy : null,
  );
  if (configured) return configured;
  const positives = profileTargetKeywords(profileConfig);
  return positives.length ? { positive: positives, negative: [] } : null;
}

function keywordHit(text, values) {
  const lower = String(text || '').toLowerCase();
  return strings(values).some((value) => lower.includes(value.toLowerCase()));
}

function reject(code, reason) {
  return {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    status: 'rejected',
    reasonCodes: [code],
    reasons: [reason],
  };
}

function review(code, reason) {
  return {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    status: 'needs_review',
    reasonCodes: [code],
    reasons: [reason],
  };
}

export async function createDiscoveryPolicy(options = {}) {
  const portalConfig = options.portalConfig || {};
  const profileConfig = options.profileConfig || {};
  const requestFilters = options.requestFilters || {};
  const targetLanePolicy = options.targetLanePolicy || {};
  const blacklist = options.blacklist || new Map();
  const seenUrls = options.seenUrls || new Set();
  const seenCompanyRoles = options.seenCompanyRoles || new Set();
  const includeBlacklisted = requestFilters.includeBlacklisted === true;
  const configuredTitlePolicy = titlePolicy(portalConfig, profileConfig, requestFilters, targetLanePolicy);

  // These helpers are the compatibility implementation already used by
  // scan.mjs. Import lazily so merely importing DiscoveryAgent performs no
  // scanner filesystem setup or dotenv work.
  const scan = await import('../scan.mjs');
  const titleFilter = configuredTitlePolicy ? scan.buildTitleFilter(configuredTitlePolicy) : null;
  const locationFilter = scan.buildLocationFilter(firstObject(requestFilters.location_filter, requestFilters.location, portalConfig.location_filter));
  const postingAgeFilter = scan.buildPostingAgeFilter(
    requestFilters.max_posting_age_days ?? requestFilters.maxPostingAgeDays ?? portalConfig.max_posting_age_days,
    options.nowMs?.() ?? Date.now(),
  );
  const postedDateFilter = scan.buildPostedDateFilter(
    requestFilters.postedAfter ?? null,
    requestFilters.postedBefore ?? null,
  );
  const salaryFilter = scan.buildSalaryFilter(firstObject(requestFilters.salary_filter, requestFilters.compensation, portalConfig.salary_filter));
  const contentFilter = scan.buildContentFilter(firstObject(requestFilters.content_filter, requestFilters.content, portalConfig.content_filter));
  const candidateCountry = profileConfig?.location?.country || null;
  const countryEligibilityFilter = scan.buildCountryEligibilityFilter(
    firstObject(requestFilters.country_eligibility_filter, requestFilters.authorization, portalConfig.country_eligibility_filter),
    candidateCountry,
  );
  const visaFilter = scan.buildVisaFilter(firstObject(requestFilters.visa_filter, requestFilters.visa, portalConfig.visa_filter));
  const canonicalizeCompany = scan.buildCompanyCanonicalizer(portalConfig.company_aliases);
  const reviewKeywords = strings(configuredTitlePolicy?.review);

  function evaluate(posting) {
    const offer = toLegacyOffer(posting);
    if (!posting.company) return review('POSTING_COMPANY_MISSING', 'Posting company is missing and cannot be inferred safely.');
    const companyKey = normalizeCompany(posting.company || '');
    const blacklistEntry = blacklist.get(companyKey);
    if (blacklistEntry && !includeBlacklisted) {
      return reject('BLACKLISTED_COMPANY', `Company is on the user-owned blacklist${blacklistEntry.reason ? `: ${blacklistEntry.reason}` : '.'}`);
    }

    if (!configuredTitlePolicy) {
      return review('TARGET_LANE_POLICY_MISSING', 'No user-layer target role policy could be resolved.');
    }
    if (reviewKeywords.length && keywordHit(posting.title, reviewKeywords)
      && scan.matchedTitleKeywords(posting.title, configuredTitlePolicy).length === 0) {
      return review('LANE_AMBIGUOUS', 'Posting matches a configured review-only lane keyword.');
    }
    if (!titleFilter(posting.title)) return reject('LANE_TITLE_REJECTED', 'Posting title does not pass the user-layer target role policy.');
    if (!locationFilter(posting.location, posting.canonicalUrl, posting.title)) return reject('LOCATION_REJECTED', 'Posting location does not pass the configured location policy.');
    if (!postingAgeFilter(offer.postedAt)) return reject('POSTING_AGE_REJECTED', 'Posting is older than the configured discovery window.');
    if (!postedDateFilter(offer.postedAt)) return reject('POSTED_DATE_REJECTED', 'Posting date is outside the requested date window.');
    if (!salaryFilter(offer.salary)) return reject('COMPENSATION_REJECTED', 'Posting compensation does not pass the configured range.');
    if (!contentFilter(offer.description, scan.matchedTitleKeywords(posting.title, configuredTitlePolicy))) {
      return reject('CONTENT_REJECTED', 'Posting content does not pass the configured content policy.');
    }
    if (!countryEligibilityFilter(offer.description)) return reject('WORK_AUTHORIZATION_REJECTED', 'Posting excludes the configured candidate country.');
    if (!visaFilter(offer.description)) return reject('VISA_POLICY_REJECTED', 'Posting does not pass the configured sponsorship policy.');

    const urlKey = scan.normalizeUrlForDedup(posting.canonicalUrl);
    if (seenUrls.has(urlKey)) return reject('DUPLICATE_URL', 'Posting URL is already known.');
    const companyRoleKey = scan.companyRoleDedupKey(posting.company, posting.title, canonicalizeCompany);
    if (seenCompanyRoles.has(companyRoleKey)) return reject('DUPLICATE_COMPANY_ROLE', 'Company and role are already known.');

    return {
      schemaVersion: DISCOVERY_SCHEMA_VERSION,
      status: 'accepted',
      reasonCodes: ['TARGET_LANE_ACCEPTED'],
      reasons: ['Posting passes the configured discovery policy.'],
      identity: { urlKey, companyRoleKey },
      annotations: blacklistEntry ? { blacklisted: true, reason: blacklistEntry.reason || null } : {},
    };
  }

  function commitIdentity(decision) {
    if (decision?.status !== 'accepted') return;
    if (decision.identity?.urlKey) seenUrls.add(decision.identity.urlKey);
    if (decision.identity?.companyRoleKey) seenCompanyRoles.add(decision.identity.companyRoleKey);
  }

  return makePortResult('ok', {
    configured: Boolean(configuredTitlePolicy),
    titlePolicySource: firstObject(requestFilters.title_filter, requestFilters.title)
      ? 'request'
      : portalConfig.title_filter ? 'portals'
        : firstObject(targetLanePolicy?.title_filter, targetLanePolicy?.positive ? targetLanePolicy : null) ? 'target-lane-policy'
          : configuredTitlePolicy ? 'profile' : 'missing',
    evaluate,
    commitIdentity,
  }, configuredTitlePolicy ? [] : [
    makeDiagnostic('TARGET_LANE_POLICY_MISSING', 'warning', 'No user-layer target role policy was found.'),
  ]);
}
