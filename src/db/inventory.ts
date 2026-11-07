import type { Vitola } from '../lib/types';
import { getDb, now, parse } from './index';

export type ItemKind = 'cigar' | 'pipe';

export interface InventoryLot {
  id: number;
  kind: ItemKind;
  itemId: number;
  vitola?: Vitola;
  quantity: number;
  unitPrice?: number;
  vendor?: string;
  acquiredAt: string;
  notes: string;
  // joined
  title: string;
  subtitle: string;
  imageUri?: string;
}

interface Row {
  id: number;
  kind: ItemKind;
  item_id: number;
  vitola_json: string | null;
  quantity: number;
  unit_price: number | null;
  vendor: string | null;
  acquired_at: string;
  notes: string;
  title: string;
  subtitle: string;
  image_uri: string | null;
}

const SELECT = `
  SELECT i.*, COALESCE(c.line, p.blend) AS title, COALESCE(c.brand, p.brand) AS subtitle,
         COALESCE(c.image_uri, p.image_uri) AS image_uri
    FROM inventory i
    LEFT JOIN cigars c ON i.kind = 'cigar' AND c.id = i.item_id
    LEFT JOIN pipe_tobaccos p ON i.kind = 'pipe' AND p.id = i.item_id`;

const toLot = (r: Row): InventoryLot => ({
  id: r.id,
  kind: r.kind,
  itemId: r.item_id,
  vitola: parse<Vitola | undefined>(r.vitola_json, undefined),
  quantity: r.quantity,
  unitPrice: r.unit_price ?? undefined,
  vendor: r.vendor ?? undefined,
  acquiredAt: r.acquired_at,
  notes: r.notes,
  title: r.title ?? 'Unknown',
  subtitle: r.subtitle ?? '',
  imageUri: r.image_uri ?? undefined,
});

export interface NewLot {
  kind: ItemKind;
  itemId: number;
  vitola?: Vitola;
  quantity: number;
  unitPrice?: number;
  vendor?: string;
  acquiredAt?: string;
  notes?: string;
}

export async function addLot(l: NewLot): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    `INSERT INTO inventory (kind, item_id, vitola_json, quantity, unit_price, vendor, acquired_at, notes)
     VALUES (?,?,?,?,?,?,?,?)`,
    l.kind, l.itemId, l.vitola ? JSON.stringify(l.vitola) : null, l.quantity,
    l.unitPrice ?? null, l.vendor ?? null, l.acquiredAt ?? now(), l.notes ?? '',
  );
  return res.lastInsertRowId;
}

export async function listLots(): Promise<InventoryLot[]> {
  const db = await getDb();
  return (await db.getAllAsync<Row>(`${SELECT} WHERE i.quantity > 0 ORDER BY subtitle, title`)).map(toLot);
}

export async function lotsFor(kind: ItemKind, itemId: number): Promise<InventoryLot[]> {
  const db = await getDb();
  return (
    await db.getAllAsync<Row>(`${SELECT} WHERE i.kind = ? AND i.item_id = ? AND i.quantity > 0 ORDER BY i.acquired_at`, kind, itemId)
  ).map(toLot);
}

export async function adjustLot(id: number, delta: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE inventory SET quantity = MAX(0, quantity + ?) WHERE id = ?', delta, id);
}

export async function deleteLot(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM inventory WHERE id = ?', id);
}

export { pickLotToDeduct, restingLabel } from '../lib/inventoryLogic';
