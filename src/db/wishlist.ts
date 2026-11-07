import type { Vitola } from '../lib/types';
import type { ItemKind } from './inventory';
import { getDb, now, parse } from './index';

export interface WishItem {
  id: number;
  kind: ItemKind;
  brand: string;
  name: string;
  cigarId?: number;
  vitola?: Vitola;
  note: string;
  addedAt: string;
  /** Single-stick (or per-ounce for pipe tobacco) price recorded per shop id. */
  prices: Record<string, { price: number; checkedAt: string }>;
}

export async function addWish(w: { kind: ItemKind; brand: string; name: string; cigarId?: number; vitola?: Vitola; note?: string }) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO wishlist (kind, brand, name, cigar_id, vitola_json, note, added_at) VALUES (?,?,?,?,?,?,?)',
    w.kind, w.brand, w.name, w.cigarId ?? null, w.vitola ? JSON.stringify(w.vitola) : null, w.note ?? '', now(),
  );
}

export async function removeWish(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM wish_prices WHERE wish_id = ?', id);
  await db.runAsync('DELETE FROM wishlist WHERE id = ?', id);
}

export async function setWishVitola(id: number, vitola: Vitola) {
  const db = await getDb();
  await db.runAsync('UPDATE wishlist SET vitola_json = ? WHERE id = ?', JSON.stringify(vitola), id);
  // Prices were for a different size — clear them.
  await db.runAsync('DELETE FROM wish_prices WHERE wish_id = ?', id);
}

export async function setWishPrice(wishId: number, shopId: string, price: number | null) {
  const db = await getDb();
  if (price == null) await db.runAsync('DELETE FROM wish_prices WHERE wish_id = ? AND shop_id = ?', wishId, shopId);
  else
    await db.runAsync(
      'INSERT OR REPLACE INTO wish_prices (wish_id, shop_id, price, checked_at) VALUES (?,?,?,?)',
      wishId, shopId, price, now(),
    );
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
    id: number; kind: ItemKind; brand: string; name: string; cigar_id: number | null; vitola_json: string | null;
    note: string; added_at: string;
  }>('SELECT * FROM wishlist ORDER BY added_at DESC');
  const prices = await db.getAllAsync<{ wish_id: number; shop_id: string; price: number; checked_at: string }>(
    'SELECT * FROM wish_prices',
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    brand: r.brand,
    name: r.name,
    cigarId: r.cigar_id ?? undefined,
    vitola: parse<Vitola | undefined>(r.vitola_json, undefined),
    note: r.note,
    addedAt: r.added_at,
    prices: Object.fromEntries(
      prices.filter((p) => p.wish_id === r.id).map((p) => [p.shop_id, { price: p.price, checkedAt: p.checked_at }]),
    ),
  }));
}

/** Lowest recorded price and which shop has it. */
export function bestPrice(w: WishItem): { shopId: string; price: number } | undefined {
  return Object.entries(w.prices)
    .map(([shopId, p]) => ({ shopId, price: p.price }))
    .sort((a, b) => a.price - b.price)[0];
}
