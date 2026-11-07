// Client for the free Google Apps Script backend that lives in your Google
// Drive (see backend-google/README.md). One Sheet holds the shared cigar
// catalog and the humidor log; Drive holds backups.
import type { SheetRow } from '../lib/catalogFormat';
import { getSettings } from '../db/settings';

export interface Reading {
  t: string; // ISO time
  rh: number;
  tempF: number;
  device?: string;
}

async function config() {
  const s = await getSettings();
  if (!s.sheetUrl) throw new Error('Google Sheet backend is not set up (Settings).');
  return s;
}

async function get<T>(params: Record<string, string>): Promise<T> {
  const s = await config();
  const url = `${s.sheetUrl}?${new URLSearchParams({ ...params, token: s.sheetToken })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet backend returned ${res.status}`);
  const body = (await res.json()) as T & { error?: string };
  if (body.error) throw new Error(body.error);
  return body;
}

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  const s = await config();
  // text/plain avoids a CORS preflight, which Apps Script can't answer.
  const res = await fetch(s.sheetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, token: s.sheetToken }),
  });
  if (!res.ok) throw new Error(`Sheet backend returned ${res.status}`);
  const body = (await res.json()) as T & { error?: string };
  if (body.error) throw new Error(body.error);
  return body;
}

export const sheet = {
  async isConfigured() {
    return !!(await getSettings()).sheetUrl;
  },
  fetchCatalog: () => get<{ rows: SheetRow[] }>({ action: 'catalog' }).then((r) => r.rows),
  upsertCatalog: (row: SheetRow) => post<{ ok: true }>({ action: 'upsertCatalog', row }),
  fetchReadings: (hours: number) => get<{ readings: Reading[] }>({ action: 'readings', hours: String(hours) }).then((r) => r.readings),
  backup: (filename: string, content: string) => post<{ ok: true; url?: string }>({ action: 'backup', filename, content }),
  ping: () => get<{ ok: true; version: string }>({ action: 'ping' }),
};
