// Match text read off a band (or typed by the user) against the catalog.
// Tolerant of OCR slips: accents, punctuation and one-letter errors in longer words.
import type { CatalogEntry } from './catalogFormat';
import type { CigarCandidate } from './types';

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STOP = new Set(['the', 'de', 'la', 'el', 'y', 'and', 'by', 'cigar', 'cigars', 'series', 'serie', 'hecho', 'a', 'mano', 'handmade', 'made', 'in']);
const tokens = (s: string) => normalize(s).split(' ').filter((t) => t && !STOP.has(t));

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenHit(t: string, haystack: string[]): boolean {
  return haystack.some((h) => h === t || (t.length >= 5 && editDistanceAtMostOne(t, h)));
}

function coverage(needles: string[], haystack: string[]): number {
  if (!needles.length) return 0;
  return needles.filter((t) => tokenHit(t, haystack)).length / needles.length;
}

export function scoreEntry(text: string[], e: CatalogEntry): number {
  const hay = tokens(text.join(' '));
  if (!hay.length) return 0;
  const brand = coverage(tokens(e.brand), hay);
  const line = coverage(tokens(e.line), hay);
  const alias = Math.max(0, ...e.aliases.map((a) => coverage(tokens(a), hay)));
  return Math.min(1, 0.5 * brand + 0.4 * line + 0.3 * alias);
}

export function matchCatalog(text: string[], catalog: CatalogEntry[], limit = 3): CigarCandidate[] {
  return catalog
    .map((e) => ({ e, score: scoreEntry(text, e) }))
    .filter((x) => x.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ e, score }) => {
      const { aliases: _aliases, ...rest } = e;
      return { ...rest, confidence: Math.round(score * 100) / 100 };
    });
}
