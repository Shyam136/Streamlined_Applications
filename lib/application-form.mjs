const SENSITIVE_RE = /\b(password|social security|ssn|date of birth|birth date|race|ethnic|gender|sex|veteran|disability|demographic|salary|compensation|sponsor|work authori[sz]ation|consent|terms|privacy|signature)\b/i;
const CAPTCHA_RE = /captcha|hcaptcha|recaptcha/i;

const FIELD_KEYS = [
  ['firstName', /\b(first|given)\s*name\b/i],
  ['lastName', /\b(last|family|sur)\s*name\b/i],
  ['fullName', /\b(full|legal)\s*name\b|^name$/i],
  ['email', /e-?mail/i],
  ['phone', /phone|mobile/i],
  ['linkedin', /linkedin/i],
  ['portfolioUrl', /portfolio|website|personal site/i],
  ['location', /\b(location|city|address)\b/i],
  ['coverLetter', /cover letter|additional information|comments/i],
  ['resumePath', /resume|r[eé]sum[eé]|curriculum vitae|\bcv\b/i],
];

export function canonicalFieldKey(field) {
  const text = `${field.label || ''} ${field.name || ''} ${field.id || ''}`.trim();
  return FIELD_KEYS.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

export function buildApplicationFillPlan(form, verifiedValues, options = {}) {
  const actions = [];
  const unresolved = [];
  if (!Array.isArray(form.fields) || form.fields.length === 0) {
    unresolved.push({ field: null, label: 'Application form', required: true, reason: 'application_form_not_found' });
  }
  const approvedSensitive = new Set(options.approvedSensitiveFields || []);
  for (const field of form.fields || []) {
    const descriptor = `${field.label || ''} ${field.name || ''}`.trim();
    const sensitive = SENSITIVE_RE.test(descriptor);
    const key = canonicalFieldKey(field);
    const exact = verifiedValues.fields?.[field.name] ?? verifiedValues.fields?.[field.label];
    let value = exact ?? (key ? verifiedValues[key] : undefined);
    if (sensitive && !approvedSensitive.has(field.name) && !approvedSensitive.has(field.label)) {
      unresolved.push({ field: field.name, label: field.label, required: field.required, reason: 'sensitive_or_legal' });
      continue;
    }
    if (value == null || value === '') {
      if (field.required) unresolved.push({ field: field.name, label: field.label, required: true, reason: key ? 'verified_value_missing' : 'unsupported_required_field' });
      continue;
    }
    if (field.type === 'radio' && Array.isArray(field.options)) {
      const wanted = String(value).trim().toLowerCase();
      const option = field.options.find((item) => String(item.value).trim().toLowerCase() === wanted || String(item.label).trim().toLowerCase() === wanted);
      if (!option) {
        unresolved.push({ field: field.name, label: field.label, required: field.required, reason: 'verified_option_not_found' });
        continue;
      }
      value = option.value;
    }
    if (field.tag === 'select' && Array.isArray(field.options) && field.options.length) {
      const wanted = String(value).trim().toLowerCase();
      const option = field.options.find((item) => String(item.value).trim().toLowerCase() === wanted || String(item.label).trim().toLowerCase() === wanted);
      if (!option) {
        unresolved.push({ field: field.name, label: field.label, required: field.required, reason: 'verified_option_not_found' });
        continue;
      }
      value = option.value;
    }
    if (field.type === 'checkbox' && typeof value !== 'boolean') {
      const normalized = String(value).trim().toLowerCase();
      if (['true', 'yes', '1', 'on'].includes(normalized)) value = true;
      else if (['false', 'no', '0', 'off'].includes(normalized)) value = false;
      else {
        unresolved.push({ field: field.name, label: field.label, required: field.required, reason: 'verified_boolean_invalid' });
        continue;
      }
    }
    const action = field.type === 'file' ? 'upload' : field.tag === 'select' ? 'select' : field.type === 'checkbox' || field.type === 'radio' ? 'check' : 'fill';
    actions.push({ fieldId: field.id, name: field.name, fieldType: field.type, action, value, evidenceRef: key || `fields.${field.name}` });
  }
  return {
    schemaVersion: '1.0', sourceUrl: form.url, actions, unresolved,
    captcha: Boolean(form.captcha || (form.markers || []).some((item) => CAPTCHA_RE.test(item))),
    canSubmit: !form.captcha && unresolved.every((item) => !item.required),
  };
}
