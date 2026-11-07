import type { PipeRatingKey } from '../data/pipe';
import { getDb, now, parse } from './index';

export interface PipeTobacco {
  id: number;
  brand: string;
  blend: string;
  cut?: string;
  components: string[];
  aromatic: boolean;
  description?: string;
  imageUri?: string;
  createdAt: string;
}

export type PipeRatings = Record<PipeRatingKey, number>;

export interface PipeReview {
  id: number;
  tobaccoId: number;
  smokedAt: string;
  ratings: PipeRatings;
  strength: number; // 0 mild .. 100 full
  moisture: number; // 0 dry .. 100 wet
  flavors: string[];
  pipe: string;
  pairing: string;
  occasion: string;
  durationMin?: number;
  notes: string;
}

interface TRow {
  id: number; brand: string; blend: string; cut: string | null; components_json: string;
  aromatic: number; description: string | null; image_uri: string | null; created_at: string;
}
const toTobacco = (r: TRow): PipeTobacco => ({
  id: r.id, brand: r.brand, blend: r.blend, cut: r.cut ?? undefined, components: parse(r.components_json, []),
  aromatic: !!r.aromatic, description: r.description ?? undefined, imageUri: r.image_uri ?? undefined, createdAt: r.created_at,
});

export async function upsertTobacco(t: Omit<PipeTobacco, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM pipe_tobaccos WHERE brand = ? AND blend = ?', t.brand, t.blend);
  if (existing) {
    await db.runAsync(
      'UPDATE pipe_tobaccos SET cut=?, components_json=?, aromatic=?, description=?, image_uri=COALESCE(?, image_uri) WHERE id=?',
      t.cut ?? null, JSON.stringify(t.components), t.aromatic ? 1 : 0, t.description ?? null, t.imageUri ?? null, existing.id,
    );
    return existing.id;
  }
  const res = await db.runAsync(
    `INSERT INTO pipe_tobaccos (brand, blend, cut, components_json, aromatic, description, image_uri, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    t.brand, t.blend, t.cut ?? null, JSON.stringify(t.components), t.aromatic ? 1 : 0, t.description ?? null, t.imageUri ?? null, now(),
  );
  return res.lastInsertRowId;
}

export async function getTobacco(id: number): Promise<PipeTobacco | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<TRow>('SELECT * FROM pipe_tobaccos WHERE id = ?', id);
  return r ? toTobacco(r) : null;
}

export interface TobaccoSummary extends PipeTobacco {
  reviewCount: number;
  avgScore: number | null;
}

export async function searchTobaccos(q: string): Promise<TobaccoSummary[]> {
  const db = await getDb();
  const like = `%${q.trim()}%`;
  const rows = await db.getAllAsync<TRow & { review_count: number; ratings: string | null }>(
    `SELECT t.*, COUNT(r.id) AS review_count, json_group_array(r.ratings_json) AS ratings
       FROM pipe_tobaccos t LEFT JOIN pipe_reviews r ON r.tobacco_id = t.id
      WHERE t.brand LIKE ? OR t.blend LIKE ? OR t.components_json LIKE ? OR t.cut LIKE ?
         OR EXISTS (SELECT 1 FROM pipe_reviews r2 WHERE r2.tobacco_id = t.id AND (r2.notes LIKE ? OR r2.flavors_json LIKE ?))
      GROUP BY t.id ORDER BY COALESCE(MAX(r.smoked_at), t.created_at) DESC`,
    like, like, like, like, like, like.toLowerCase().replace(/ /g, '-'),
  );
  return rows.map((r) => {
    const all = parse<(string | null)[]>(r.ratings, [])
      .filter((x): x is string => !!x)
      .map((x) => parse<PipeRatings | null>(x, null))
      .filter((x): x is PipeRatings => !!x);
    const avg = all.length ? all.reduce((s, x) => s + overallPipe(x), 0) / all.length : null;
    return { ...toTobacco(r), reviewCount: r.review_count, avgScore: avg };
  });
}

export function overallPipe(r: PipeRatings): number {
  const v = Object.values(r);
  return v.reduce((s, x) => s + x, 0) / v.length;
}

export async function addPipeReview(r: Omit<PipeReview, 'id' | 'smokedAt'>): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    `INSERT INTO pipe_reviews (tobacco_id, smoked_at, ratings_json, strength, moisture, flavors_json, pipe, pairing, occasion, duration_min, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    r.tobaccoId, now(), JSON.stringify(r.ratings), Math.round(r.strength), Math.round(r.moisture), JSON.stringify(r.flavors),
    r.pipe, r.pairing, r.occasion, r.durationMin ?? null, r.notes,
  );
  return res.lastInsertRowId;
}

export async function getPipeReviews(tobaccoId: number): Promise<PipeReview[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number; tobacco_id: number; smoked_at: string; ratings_json: string; strength: number; moisture: number;
    flavors_json: string; pipe: string; pairing: string; occasion: string; duration_min: number | null; notes: string;
  }>('SELECT * FROM pipe_reviews WHERE tobacco_id = ? ORDER BY smoked_at DESC', tobaccoId);
  return rows.map((r) => ({
    id: r.id, tobaccoId: r.tobacco_id, smokedAt: r.smoked_at, ratings: parse(r.ratings_json, {} as PipeRatings),
    strength: r.strength, moisture: r.moisture, flavors: parse(r.flavors_json, []), pipe: r.pipe, pairing: r.pairing,
    occasion: r.occasion, durationMin: r.duration_min ?? undefined, notes: r.notes,
  }));
}
