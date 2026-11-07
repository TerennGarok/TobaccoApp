// Export (CSV for spreadsheets) and full backup / restore (JSON).
// Backups can also go to your Google Drive through the Apps Script backend.
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { noteLabel } from '../data/flavors';
import { getDb } from '../db';
import { sheet } from './sheet';

const TABLES = ['cigars', 'reviews', 'inventory', 'wishlist', 'pipe_tobaccos', 'pipe_reviews', 'settings', 'catalog_cache'] as const;

export async function buildBackup(): Promise<string> {
  const db = await getDb();
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.getAllAsync(`SELECT * FROM ${t}`);
  return JSON.stringify({ app: 'humidor', version: 2, exportedAt: new Date().toISOString(), data });
}

export async function restoreBackup(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { app?: string; data?: Record<string, Record<string, unknown>[]> };
  if (parsed.app !== 'humidor' || !parsed.data) throw new Error('Not a Humidor backup file.');
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const t of TABLES) {
      const rows = parsed.data![t] ?? [];
      await db.runAsync(`DELETE FROM ${t}`);
      for (const r of rows) {
        const cols = Object.keys(r);
        if (!cols.length) continue;
        await db.runAsync(
          `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
          ...cols.map((c) => r[c] as string | number | null),
        );
      }
    }
  });
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n');

export async function buildCigarCsv(): Promise<string> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, string | number | null>>(
    `SELECT r.smoked_at, c.brand, c.line, r.vitola_json, c.wrapper, c.origin, r.flavor, r.aroma, r.burn, r.construction, r.draw,
            r.has_spice, r.body, r.flavors_json, r.pairing, r.occasion, r.duration_min, r.notes
       FROM reviews r JOIN cigars c ON c.id = r.cigar_id ORDER BY r.smoked_at`,
  );
  const header = ['Date', 'Brand', 'Line', 'Size', 'Wrapper', 'Origin', 'Flavor', 'Aroma', 'Burn', 'Construction', 'Draw', 'Overall',
    'Spice', 'Body (0-100)', 'Flavor notes', 'Pairing', 'Occasion', 'Minutes', 'Notes'];
  return csv([
    header,
    ...rows.map((r) => {
      const v = r.vitola_json ? (JSON.parse(String(r.vitola_json)) as { name: string; lengthIn: number; ringGauge: number }) : null;
      const overall = ((Number(r.flavor) + Number(r.aroma) + Number(r.burn) + Number(r.construction) + Number(r.draw)) / 5).toFixed(1);
      const flavors = (JSON.parse(String(r.flavors_json ?? '[]')) as string[]).map(noteLabel).join('; ');
      return [String(r.smoked_at).slice(0, 10), r.brand, r.line, v ? `${v.name} ${v.lengthIn}x${v.ringGauge}` : '', r.wrapper, r.origin,
        r.flavor, r.aroma, r.burn, r.construction, r.draw, overall, r.has_spice ? 'Yes' : 'No', r.body, flavors, r.pairing, r.occasion,
        r.duration_min, r.notes];
    }),
  ]);
}

export async function buildPipeCsv(): Promise<string> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, string | number | null>>(
    `SELECT r.smoked_at, t.brand, t.blend, t.cut, t.components_json, r.ratings_json, r.strength, r.moisture, r.flavors_json,
            r.pipe, r.pairing, r.occasion, r.duration_min, r.notes
       FROM pipe_reviews r JOIN pipe_tobaccos t ON t.id = r.tobacco_id ORDER BY r.smoked_at`,
  );
  return csv([
    ['Date', 'Brand', 'Blend', 'Cut', 'Components', 'Flavor', 'Room note', 'Burn', 'Bite-free', 'Consistency', 'Strength', 'Moisture',
      'Flavor notes', 'Pipe', 'Pairing', 'Occasion', 'Minutes', 'Notes'],
    ...rows.map((r) => {
      const g = JSON.parse(String(r.ratings_json)) as Record<string, number>;
      return [String(r.smoked_at).slice(0, 10), r.brand, r.blend, r.cut, (JSON.parse(String(r.components_json)) as string[]).join('; '),
        g.flavor, g.roomNote, g.burn, g.biteFree, g.consistency, r.strength, r.moisture,
        (JSON.parse(String(r.flavors_json)) as string[]).join('; '), r.pipe, r.pairing, r.occasion, r.duration_min, r.notes];
    }),
  ]);
}

/** Hand a file to the OS share sheet (save to Files, email, Drive app…) or download it on web. */
export async function shareText(filename: string, content: string, mime: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const f = new File(Paths.cache, filename);
  f.write(content);
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: filename });
}

export const stamp = () => new Date().toISOString().slice(0, 10);

export async function backupToDrive(): Promise<string | undefined> {
  const res = await sheet.backup(`humidor-backup-${stamp()}.json`, await buildBackup());
  return res.url;
}

/** Weekly automatic backup: a file on the device, plus Drive when the Sheet is connected. */
export async function autoBackupIfDue(): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'lastAutoBackup'");
  const last = row ? Number(JSON.parse(row.value)) : 0;
  if (Date.now() - last < 7 * 86_400_000) return;
  const content = await buildBackup();
  if (Platform.OS !== 'web') {
    const dir = new Directory(Paths.document, 'backups');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    new File(dir, `humidor-backup-${stamp()}.json`).write(content);
  }
  if (await sheet.isConfigured()) await sheet.backup(`humidor-backup-${stamp()}.json`, content).catch(() => undefined);
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('lastAutoBackup', ?)", JSON.stringify(Date.now()));
}
