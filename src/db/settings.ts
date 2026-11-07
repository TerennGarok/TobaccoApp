import { getDb } from './index';

export interface AppSettings {
  /** Google Apps Script web-app URL (shared catalog, humidor log, Drive backups). */
  sheetUrl: string;
  /** Shared secret configured in the Apps Script (Script Properties → TOKEN). */
  sheetToken: string;
  /** Your name, stamped on catalog entries you contribute (useful once friends share the sheet). */
  displayName: string;
  /** Where humidor readings come from: 'sheet' (anywhere) or a LAN URL to the sensor. */
  humidorSource: 'sheet' | 'device';
  humidorDeviceUrl: string;
  rhMin: number;
  rhMax: number;
  tempMin: number;
  tempMax: number;
  ntfyTopic: string;
  lastCatalogSync: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  sheetUrl: '',
  sheetToken: '',
  displayName: '',
  humidorSource: 'sheet',
  humidorDeviceUrl: 'http://humidor.local',
  rhMin: 65,
  rhMax: 70,
  tempMin: 62,
  tempMax: 72,
  ntfyTopic: '',
  lastCatalogSync: '',
};

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      // ignore corrupt values
    }
  }
  return out as unknown as AppSettings;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const db = await getDb();
  for (const [k, v] of Object.entries(patch)) {
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', k, JSON.stringify(v));
  }
}
