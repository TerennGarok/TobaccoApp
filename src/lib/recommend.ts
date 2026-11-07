// "Try next" — catalog cigars you haven't smoked that resemble the ones you rated highly.
import type { CatalogEntry } from './catalogFormat';
import { catalogKey } from './catalogFormat';
import { strengthToBody } from './types';

export interface Liked {
  brand: string;
  line: string;
  score: number; // 0..5
  flavors: string[];
  body: number; // 0..100
  wrapper?: string;
}

export interface Recommendation {
  entry: CatalogEntry;
  because: string;
  similarity: number;
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

const wrapperFamily = (w?: string) => {
  const s = (w ?? '').toLowerCase();
  for (const k of ['maduro', 'connecticut', 'habano', 'corojo', 'cameroon', 'sumatra', 'oscuro', 'san andres', 'broadleaf', 'rosado'])
    if (s.includes(k)) return k;
  return s || undefined;
};

export function similarity(e: CatalogEntry, l: Liked): number {
  const flavors = jaccard(new Set(e.flavorSuggestions.map((f) => f.noteId)), new Set(l.flavors));
  const body = 1 - Math.abs(strengthToBody(e.strength) - l.body) / 100;
  const wrap = wrapperFamily(e.wrapper) && wrapperFamily(e.wrapper) === wrapperFamily(l.wrapper) ? 1 : 0;
  return 0.6 * flavors + 0.25 * body + 0.15 * wrap;
}

export function recommend(catalog: CatalogEntry[], liked: Liked[], smoked: Set<string>, limit = 6): Recommendation[] {
  const favourites = liked.filter((l) => l.score >= 4);
  if (!favourites.length) return [];
  return catalog
    .filter((e) => !smoked.has(catalogKey(e.brand, e.line)))
    .map((entry) => {
      let best = { similarity: 0, because: '' };
      for (const l of favourites) {
        const s = similarity(entry, l);
        if (s > best.similarity) best = { similarity: s, because: `${l.brand} ${l.line}` };
      }
      return { entry, ...best };
    })
    .filter((r) => r.similarity >= 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
