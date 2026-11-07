// Local-first storage. Everything lives on the device in SQLite so the app is
// fully usable offline; a sync layer can be added later (see docs/ROADMAP.md).
import * as SQLite from 'expo-sqlite';
import type {
  Cigar,
  CigarCandidate,
  IdentificationResult,
  QueueItem,
  QueueStatus,
  Ratings,
  Review,
  Vitola,
} from '../lib/types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS cigars (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     brand TEXT NOT NULL,
     line TEXT NOT NULL,
     manufacturer TEXT, wrapper TEXT, binder TEXT, filler TEXT, origin TEXT,
     strength TEXT, description TEXT,
     vitolas_json TEXT NOT NULL DEFAULT '[]',
     flavor_suggestions_json TEXT NOT NULL DEFAULT '[]',
     external_reviews_json TEXT NOT NULL DEFAULT '[]',
     source_urls_json TEXT NOT NULL DEFAULT '[]',
     image_uri TEXT,
     created_at TEXT NOT NULL,
     UNIQUE (brand, line)
   );
   CREATE TABLE IF NOT EXISTS reviews (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     cigar_id INTEGER NOT NULL REFERENCES cigars(id) ON DELETE CASCADE,
     vitola_json TEXT,
     smoked_at TEXT NOT NULL,
     flavor INTEGER NOT NULL, aroma INTEGER NOT NULL, burn INTEGER NOT NULL,
     construction INTEGER NOT NULL, draw INTEGER NOT NULL,
     has_spice INTEGER NOT NULL,
     body INTEGER NOT NULL,
     flavors_json TEXT NOT NULL DEFAULT '[]',
     notes TEXT NOT NULL DEFAULT ''
   );
   CREATE TABLE IF NOT EXISTS id_queue (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     image_uri TEXT NOT NULL,
     status TEXT NOT NULL,
     result_json TEXT,
     error TEXT,
     attempts INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   );`,
  // v2: session context, inventory, wishlist, pipe tobacco, settings, shared catalog cache
  `ALTER TABLE reviews ADD COLUMN pairing TEXT NOT NULL DEFAULT '';
   ALTER TABLE reviews ADD COLUMN occasion TEXT NOT NULL DEFAULT '';
   ALTER TABLE reviews ADD COLUMN duration_min INTEGER;
   CREATE TABLE IF NOT EXISTS inventory (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL,              -- 'cigar' | 'pipe'
     item_id INTEGER NOT NULL,        -- cigars.id or pipe_tobaccos.id
     vitola_json TEXT,
     quantity REAL NOT NULL,          -- sticks, or ounces for pipe tobacco
     unit_price REAL,                 -- paid per stick / per ounce
     vendor TEXT,
     acquired_at TEXT NOT NULL,
     notes TEXT NOT NULL DEFAULT ''
   );
   CREATE TABLE IF NOT EXISTS wishlist (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL,
     brand TEXT NOT NULL,
     name TEXT NOT NULL,
     cigar_id INTEGER,
     note TEXT NOT NULL DEFAULT '',
     added_at TEXT NOT NULL,
     UNIQUE (kind, brand, name)
   );
   CREATE TABLE IF NOT EXISTS pipe_tobaccos (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     brand TEXT NOT NULL,
     blend TEXT NOT NULL,
     cut TEXT,
     components_json TEXT NOT NULL DEFAULT '[]',
     aromatic INTEGER NOT NULL DEFAULT 0,
     description TEXT,
     image_uri TEXT,
     created_at TEXT NOT NULL,
     UNIQUE (brand, blend)
   );
   CREATE TABLE IF NOT EXISTS pipe_reviews (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     tobacco_id INTEGER NOT NULL REFERENCES pipe_tobaccos(id) ON DELETE CASCADE,
     smoked_at TEXT NOT NULL,
     ratings_json TEXT NOT NULL,
     strength INTEGER NOT NULL,
     moisture INTEGER NOT NULL,
     flavors_json TEXT NOT NULL DEFAULT '[]',
     pipe TEXT NOT NULL DEFAULT '',
     pairing TEXT NOT NULL DEFAULT '',
     occasion TEXT NOT NULL DEFAULT '',
     duration_min INTEGER,
     notes TEXT NOT NULL DEFAULT ''
   );
   CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS catalog_cache (
     key TEXT PRIMARY KEY,            -- lower(brand|line)
     json TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );`,
];

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('humidor.db');
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      let version = row?.user_version ?? 0;
      while (version < MIGRATIONS.length) {
        await db.execAsync(MIGRATIONS[version]);
        version += 1;
        await db.execAsync(`PRAGMA user_version = ${version}`);
      }
      return db;
    })();
  }
  return dbPromise;
}

export const now = () => new Date().toISOString();
export const parse = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

// ---------- cigars ----------

interface CigarRow {
  id: number;
  brand: string;
  line: string;
  manufacturer: string | null;
  wrapper: string | null;
  binder: string | null;
  filler: string | null;
  origin: string | null;
  strength: string | null;
  description: string | null;
  vitolas_json: string;
  flavor_suggestions_json: string;
  external_reviews_json: string;
  source_urls_json: string;
  image_uri: string | null;
  created_at: string;
}

function toCigar(r: CigarRow): Cigar {
  return {
    id: r.id,
    brand: r.brand,
    line: r.line,
    manufacturer: r.manufacturer ?? undefined,
    wrapper: r.wrapper ?? undefined,
    binder: r.binder ?? undefined,
    filler: r.filler ?? undefined,
    origin: r.origin ?? undefined,
    strength: (r.strength ?? undefined) as Cigar['strength'],
    description: r.description ?? undefined,
    vitolas: parse(r.vitolas_json, []),
    flavorSuggestions: parse(r.flavor_suggestions_json, []),
    externalReviews: parse(r.external_reviews_json, []),
    sourceUrls: parse(r.source_urls_json, []),
    imageUri: r.image_uri ?? undefined,
    createdAt: r.created_at,
  };
}

/** Insert a cigar, or refresh catalog data if this brand+line already exists. */
export async function upsertCigar(c: CigarCandidate, imageUri?: string): Promise<number> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM cigars WHERE brand = ? AND line = ?',
    c.brand,
    c.line,
  );
  const values = [
    c.manufacturer ?? null, c.wrapper ?? null, c.binder ?? null, c.filler ?? null,
    c.origin ?? null, c.strength ?? null, c.description ?? null,
    JSON.stringify(c.vitolas), JSON.stringify(c.flavorSuggestions),
    JSON.stringify(c.externalReviews), JSON.stringify(c.sourceUrls ?? []),
  ];
  if (existing) {
    await db.runAsync(
      `UPDATE cigars SET manufacturer=?, wrapper=?, binder=?, filler=?, origin=?, strength=?,
         description=?, vitolas_json=?, flavor_suggestions_json=?, external_reviews_json=?,
         source_urls_json=?, image_uri=COALESCE(image_uri, ?) WHERE id=?`,
      ...values, imageUri ?? null, existing.id,
    );
    return existing.id;
  }
  const res = await db.runAsync(
    `INSERT INTO cigars (manufacturer, wrapper, binder, filler, origin, strength, description,
       vitolas_json, flavor_suggestions_json, external_reviews_json, source_urls_json,
       brand, line, image_uri, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ...values, c.brand, c.line, imageUri ?? null, now(),
  );
  return res.lastInsertRowId;
}

export async function findCigarId(brand: string, line: string): Promise<number | undefined> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ id: number }>('SELECT id FROM cigars WHERE brand = ? AND line = ?', brand, line);
  return r?.id;
}

export async function listCigars(): Promise<Cigar[]> {
  const db = await getDb();
  return (await db.getAllAsync<CigarRow>('SELECT * FROM cigars ORDER BY brand, line')).map(toCigar);
}

export async function getCigar(id: number): Promise<Cigar | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<CigarRow>('SELECT * FROM cigars WHERE id = ?', id);
  return r ? toCigar(r) : null;
}

export interface CigarSummary extends Cigar {
  reviewCount: number;
  avgScore: number | null; // mean of the five ratings across all reviews
  lastSmoked: string | null;
}

export async function searchCigars(query: string): Promise<CigarSummary[]> {
  const db = await getDb();
  const q = `%${query.trim()}%`;
  const rows = await db.getAllAsync<CigarRow & { review_count: number; avg_score: number | null; last_smoked: string | null }>(
    `SELECT c.*, COUNT(r.id) AS review_count,
            AVG((r.flavor + r.aroma + r.burn + r.construction + r.draw) / 5.0) AS avg_score,
            MAX(r.smoked_at) AS last_smoked
       FROM cigars c LEFT JOIN reviews r ON r.cigar_id = c.id
      WHERE c.brand LIKE ? OR c.line LIKE ? OR c.wrapper LIKE ? OR c.origin LIKE ?
         OR c.flavor_suggestions_json LIKE ?
         OR EXISTS (SELECT 1 FROM reviews r2 WHERE r2.cigar_id = c.id
                     AND (r2.notes LIKE ? OR r2.flavors_json LIKE ?))
      GROUP BY c.id
      ORDER BY COALESCE(MAX(r.smoked_at), c.created_at) DESC`,
    q, q, q, q, q.toLowerCase().replace(/ /g, '-'), q, q.toLowerCase().replace(/ /g, '-'),
  );
  return rows.map((r) => ({
    ...toCigar(r),
    reviewCount: r.review_count,
    avgScore: r.avg_score,
    lastSmoked: r.last_smoked,
  }));
}

// ---------- reviews ----------

interface ReviewRow {
  id: number;
  cigar_id: number;
  vitola_json: string | null;
  smoked_at: string;
  flavor: number;
  aroma: number;
  burn: number;
  construction: number;
  draw: number;
  has_spice: number;
  pairing: string;
  occasion: string;
  duration_min: number | null;
  body: number;
  flavors_json: string;
  notes: string;
}

export interface NewReview {
  cigarId: number;
  vitola?: Vitola;
  ratings: Ratings;
  hasSpice: boolean;
  body: number;
  flavors: string[];
  notes: string;
  pairing: string;
  occasion: string;
  durationMin?: number;
}

export async function addReview(r: NewReview): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    `INSERT INTO reviews (cigar_id, vitola_json, smoked_at, flavor, aroma, burn, construction, draw,
       has_spice, body, flavors_json, notes, pairing, occasion, duration_min) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    r.cigarId, r.vitola ? JSON.stringify(r.vitola) : null, now(),
    r.ratings.flavor, r.ratings.aroma, r.ratings.burn, r.ratings.construction, r.ratings.draw,
    r.hasSpice ? 1 : 0, Math.round(r.body), JSON.stringify(r.flavors), r.notes,
    r.pairing, r.occasion, r.durationMin ?? null,
  );
  return res.lastInsertRowId;
}

export async function getReviews(cigarId: number): Promise<Review[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ReviewRow>(
    'SELECT * FROM reviews WHERE cigar_id = ? ORDER BY smoked_at DESC',
    cigarId,
  );
  return rows.map((r) => ({
    id: r.id,
    cigarId: r.cigar_id,
    vitola: parse<Vitola | undefined>(r.vitola_json, undefined),
    smokedAt: r.smoked_at,
    ratings: { flavor: r.flavor, aroma: r.aroma, burn: r.burn, construction: r.construction, draw: r.draw },
    hasSpice: !!r.has_spice,
    body: r.body,
    flavors: parse(r.flavors_json, []),
    notes: r.notes,
    pairing: r.pairing,
    occasion: r.occasion,
    durationMin: r.duration_min ?? undefined,
  }));
}

// ---------- identification queue ----------

interface QueueRow {
  id: number;
  image_uri: string;
  status: QueueStatus;
  result_json: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
}

const toQueueItem = (r: QueueRow): QueueItem => ({
  id: r.id,
  imageUri: r.image_uri,
  status: r.status,
  result: parse<IdentificationResult | undefined>(r.result_json, undefined),
  error: r.error ?? undefined,
  attempts: r.attempts,
  createdAt: r.created_at,
});

export async function enqueuePhoto(imageUri: string): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    "INSERT INTO id_queue (image_uri, status, created_at) VALUES (?, 'pending', ?)",
    imageUri,
    now(),
  );
  return res.lastInsertRowId;
}

export async function getQueueItem(id: number): Promise<QueueItem | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<QueueRow>('SELECT * FROM id_queue WHERE id = ?', id);
  return r ? toQueueItem(r) : null;
}

/** Everything the user still has to act on (waiting, ready to verify, or failed). */
export async function listOpenQueue(): Promise<QueueItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<QueueRow>(
    "SELECT * FROM id_queue WHERE status != 'confirmed' ORDER BY created_at DESC",
  );
  return rows.map(toQueueItem);
}

export async function claimPending(): Promise<QueueItem[]> {
  const db = await getDb();
  // Anything left 'processing' by a killed app is retried too.
  const rows = await db.getAllAsync<QueueRow>(
    "SELECT * FROM id_queue WHERE status IN ('pending', 'processing') ORDER BY created_at",
  );
  for (const r of rows) {
    await db.runAsync("UPDATE id_queue SET status='processing', attempts=attempts+1 WHERE id=?", r.id);
  }
  return rows.map(toQueueItem);
}

export async function setQueueResult(id: number, result: IdentificationResult): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE id_queue SET status='ready', result_json=?, error=NULL WHERE id=?",
    JSON.stringify(result),
    id,
  );
}

export async function setQueueStatus(id: number, status: QueueStatus, error?: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE id_queue SET status=?, error=? WHERE id=?', status, error ?? null, id);
}

export async function deleteQueueItem(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM id_queue WHERE id=?', id);
}
