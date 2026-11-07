// The shared catalog lives in a Google Sheet that people can read and edit by
// hand, so sizes and flavors are stored as plain text columns:
//   sizes:   "Robusto 5x50; Toro 6x52 box-pressed; Belicoso 5.5x52 belicoso"
//   flavors: "Cocoa, Black Pepper, Cedar"
import { noteLabel, normalizeFlavor } from '../data/flavors';
import type { CigarCandidate, FlavorSuggestion, Strength, Vitola } from './types';

export interface SheetRow {
  brand: string;
  line: string;
  aliases?: string;
  manufacturer?: string;
  wrapper?: string;
  binder?: string;
  filler?: string;
  origin?: string;
  strength?: string;
  sizes?: string;
  flavors_maker?: string;
  flavors_reviews?: string;
  description?: string;
  updated_by?: string;
  updated_at?: string;
}

export interface CatalogEntry extends Omit<CigarCandidate, 'confidence'> {
  aliases: string[];
}

const SIZE_RE = /^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:"|in)?\s*[x×]\s*(\d{2,3})(?:\s+(.+))?$/i;

export function parseSizes(text = ''): Vitola[] {
  return text
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(SIZE_RE);
      if (!m) return null;
      return { name: m[1].trim(), lengthIn: Number(m[2]), ringGauge: Number(m[3]), ...(m[4] ? { shape: m[4].trim() } : {}) };
    })
    .filter((v): v is Vitola => !!v);
}

export function formatSizes(v: Vitola[]): string {
  return v.map((x) => `${x.name} ${x.lengthIn}x${x.ringGauge}${x.shape ? ` ${x.shape}` : ''}`).join('; ');
}

const STRENGTHS: Strength[] = ['mild', 'mild-medium', 'medium', 'medium-full', 'full'];
function parseStrength(s?: string): Strength | undefined {
  const k = s?.toLowerCase().trim().replace(/[\s–—/]+/g, '-');
  return STRENGTHS.find((x) => x === k);
}

function parseFlavorList(text: string | undefined): string[] {
  return (text ?? '')
    .split(/[,;]/)
    .map((s) => normalizeFlavor(s))
    .filter((x): x is string => !!x);
}

export function rowToEntry(r: SheetRow): CatalogEntry | null {
  if (!r.brand?.trim() || !r.line?.trim()) return null;
  const maker = new Set(parseFlavorList(r.flavors_maker));
  const reviews = new Set(parseFlavorList(r.flavors_reviews));
  const flavorSuggestions: FlavorSuggestion[] = [...new Set([...maker, ...reviews])].map((noteId) => ({
    noteId,
    source: maker.has(noteId) && reviews.has(noteId) ? 'both' : maker.has(noteId) ? 'manufacturer' : 'reviews',
  }));
  const opt = (s?: string) => (s && s.trim() ? s.trim() : undefined);
  return {
    brand: r.brand.trim(),
    line: r.line.trim(),
    aliases: (r.aliases ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean),
    manufacturer: opt(r.manufacturer),
    wrapper: opt(r.wrapper),
    binder: opt(r.binder),
    filler: opt(r.filler),
    origin: opt(r.origin),
    strength: parseStrength(r.strength),
    description: opt(r.description),
    vitolas: parseSizes(r.sizes),
    flavorSuggestions,
    externalReviews: [],
  };
}

export function entryToRow(e: CatalogEntry | CigarCandidate, updatedBy = ''): SheetRow {
  const pick = (src: FlavorSuggestion['source']) =>
    e.flavorSuggestions.filter((f) => f.source === src || f.source === 'both').map((f) => noteLabel(f.noteId)).join(', ');
  return {
    brand: e.brand,
    line: e.line,
    aliases: 'aliases' in e ? e.aliases.join(', ') : '',
    manufacturer: e.manufacturer ?? '',
    wrapper: e.wrapper ?? '',
    binder: e.binder ?? '',
    filler: e.filler ?? '',
    origin: e.origin ?? '',
    strength: e.strength ?? '',
    sizes: formatSizes(e.vitolas),
    flavors_maker: pick('manufacturer'),
    flavors_reviews: pick('reviews'),
    description: e.description ?? '',
    updated_by: updatedBy,
  };
}

export const catalogKey = (brand: string, line: string) => `${brand}|${line}`.toLowerCase().trim();
