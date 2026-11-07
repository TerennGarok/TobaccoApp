// The catalog the band matcher searches. Merged, in priority order, from:
//   1. the shared Google Sheet (cached on the device for offline use)
//   2. cigars already in your journal
//   3. the small built-in sample catalog
// Verified identifications are contributed back to the Sheet (queued while offline).
import { SAMPLE_CATALOG } from '../data/sampleCatalog';
import { getDb, listCigars, now, parse } from '../db';
import { getSettings, saveSettings } from '../db/settings';
import { type CatalogEntry, catalogKey, entryToRow, rowToEntry, type SheetRow } from '../lib/catalogFormat';
import type { CigarCandidate, Vitola } from '../lib/types';
import { sheet } from './sheet';

function mergeVitolas(a: Vitola[], b: Vitola[]): Vitola[] {
  const out = new Map<string, Vitola>();
  for (const v of [...b, ...a]) out.set(`${v.name.toLowerCase()}|${v.lengthIn}|${v.ringGauge}`, v);
  return [...out.values()].sort((x, y) => x.lengthIn - y.lengthIn || x.ringGauge - y.ringGauge);
}

export async function loadCatalog(): Promise<CatalogEntry[]> {
  const db = await getDb();
  const cached = (await db.getAllAsync<{ json: string }>('SELECT json FROM catalog_cache'))
    .map((r) => parse<CatalogEntry | null>(r.json, null))
    .filter((e): e is CatalogEntry => !!e);
  const mine: CatalogEntry[] = (await listCigars()).map(({ id: _id, imageUri: _i, createdAt: _c, ...c }) => ({ ...c, aliases: [] }));
  const sample: CatalogEntry[] = SAMPLE_CATALOG.map(({ confidence: _c, ...c }) => ({ ...c, aliases: [] }));

  const merged = new Map<string, CatalogEntry>();
  for (const e of [...sample, ...mine, ...cached]) {
    const k = catalogKey(e.brand, e.line);
    const prev = merged.get(k);
    merged.set(
      k,
      prev
        ? {
            ...prev,
            ...Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && v !== '')),
            vitolas: mergeVitolas(prev.vitolas, e.vitolas),
            flavorSuggestions: e.flavorSuggestions.length ? e.flavorSuggestions : prev.flavorSuggestions,
            externalReviews: e.externalReviews.length ? e.externalReviews : prev.externalReviews,
            aliases: [...new Set([...prev.aliases, ...e.aliases])],
          }
        : e,
    );
  }
  return [...merged.values()];
}

let syncing = false;

/** Pull the shared catalog and push anything queued. Safe to call often. */
export async function syncCatalog(): Promise<{ pulled: number; pushed: number } | null> {
  if (syncing || !(await sheet.isConfigured())) return null;
  syncing = true;
  try {
    const pushed = await flushOutbox();
    const rows = await sheet.fetchCatalog();
    const db = await getDb();
    const stamp = now();
    let pulled = 0;
    await db.withTransactionAsync(async () => {
      for (const row of rows) {
        const e = rowToEntry(row);
        if (!e) continue;
        await db.runAsync(
          'INSERT OR REPLACE INTO catalog_cache (key, json, updated_at) VALUES (?, ?, ?)',
          catalogKey(e.brand, e.line), JSON.stringify(e), stamp,
        );
        pulled++;
      }
    });
    await saveSettings({ lastCatalogSync: stamp });
    return { pulled, pushed };
  } finally {
    syncing = false;
  }
}

/** Share a verified cigar (and the size you smoked) with everyone using the Sheet. */
export async function contribute(c: CigarCandidate, vitola?: Vitola): Promise<void> {
  const s = await getSettings();
  if (!s.sheetUrl) return;
  const entry = { ...c, vitolas: vitola ? mergeVitolas(c.vitolas, [vitola]) : c.vitolas };
  const row = entryToRow(entry, s.displayName);
  const outbox = await getOutbox();
  outbox.push(row);
  await saveOutbox(outbox);
  await flushOutbox().catch(() => undefined);
}

const OUTBOX = 'catalogOutbox';
async function getOutbox(): Promise<SheetRow[]> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', OUTBOX);
  return parse<SheetRow[]>(r?.value, []);
}
async function saveOutbox(rows: SheetRow[]) {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', OUTBOX, JSON.stringify(rows));
}
async function flushOutbox(): Promise<number> {
  const rows = await getOutbox();
  let sent = 0;
  while (rows.length) {
    await sheet.upsertCatalog(rows[0]);
    rows.shift();
    sent++;
    await saveOutbox(rows);
  }
  return sent;
}
