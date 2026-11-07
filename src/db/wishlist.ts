import type { ItemKind } from './inventory';
import { getDb, now } from './index';

export interface WishItem {
  id: number;
  kind: ItemKind;
  brand: string;
  name: string;
  cigarId?: number;
  note: string;
  addedAt: string;
}

export async function addWish(w: { kind: ItemKind; brand: string; name: string; cigarId?: number; note?: string }) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO wishlist (kind, brand, name, cigar_id, note, added_at) VALUES (?,?,?,?,?,?)',
    w.kind, w.brand, w.name, w.cigarId ?? null, w.note ?? '', now(),
  );
}

export async function removeWish(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM wishlist WHERE id = ?', id);
}

export async function isWished(kind: ItemKind, brand: string, name: string): Promise<number | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM wishlist WHERE kind = ? AND brand = ? AND name = ?', kind, brand, name,
  );
  return r?.id ?? null;
}

export async function listWishes(): Promise<WishItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number; kind: ItemKind; brand: string; name: string; cigar_id: number | null; note: string; added_at: string;
  }>('SELECT * FROM wishlist ORDER BY added_at DESC');
  return rows.map((r) => ({
    id: r.id, kind: r.kind, brand: r.brand, name: r.name, cigarId: r.cigar_id ?? undefined, note: r.note, addedAt: r.added_at,
  }));
}
