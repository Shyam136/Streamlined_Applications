import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import path from 'path';

export function createSubmissionLedger(file) {
  function load() {
    if (!existsSync(file)) return { schemaVersion: '1.0', actions: {} };
    return JSON.parse(readFileSync(file, 'utf-8'));
  }
  function save(value) {
    mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    try { writeFileSync(temp, JSON.stringify(value, null, 2) + '\n'); renameSync(temp, file); }
    catch (error) { rmSync(temp, { force: true }); throw error; }
  }
  return {
    get(actionId) { return load().actions[actionId] || null; },
    begin(actionId, record) {
      const data = load();
      if (data.actions[actionId]) return data.actions[actionId];
      data.actions[actionId] = { actionId, status: 'intent_recorded', recordedAt: new Date().toISOString(), applyUrl: record.applyUrl, trackerSelector: record.trackerSelector };
      save(data);
      return data.actions[actionId];
    },
    complete(actionId, evidence) {
      const data = load();
      if (!data.actions[actionId]) throw new Error('submission intent is missing');
      data.actions[actionId] = { ...data.actions[actionId], status: 'confirmed', completedAt: new Date().toISOString(), evidence };
      save(data);
      return data.actions[actionId];
    },
    uncertain(actionId, reason) {
      const data = load();
      if (!data.actions[actionId]) throw new Error('submission intent is missing');
      data.actions[actionId] = { ...data.actions[actionId], status: 'uncertain', completedAt: new Date().toISOString(), reason: String(reason).slice(0, 300) };
      save(data);
      return data.actions[actionId];
    },
  };
}

export function countConfirmedSubmissions(file, isoDate) {
  if (!existsSync(file)) return 0;
  const data = JSON.parse(readFileSync(file, 'utf-8'));
  return Object.values(data.actions || {}).filter((action) =>
    action?.status === 'confirmed' && String(action.completedAt || '').slice(0, 10) === isoDate
  ).length;
}

export function countConfirmedSubmissionsSince(file, sinceMs) {
  if (!existsSync(file)) return 0;
  const data = JSON.parse(readFileSync(file, 'utf-8'));
  return Object.values(data.actions || {}).filter((action) => {
    if (action?.status !== 'confirmed') return false;
    const completedAt = Date.parse(String(action.completedAt || ''));
    return Number.isFinite(completedAt) && completedAt >= sinceMs;
  }).length;
}
