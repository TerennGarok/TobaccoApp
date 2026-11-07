import type { Ratings, Review } from './types';
import { RATING_FIELDS } from './types';

export interface Aggregate {
  count: number;
  ratings: Ratings | null;
  overall: number | null;
  body: number | null;
  spicePct: number | null;
  flavorCounts: { noteId: string; count: number }[];
}

/** Roll every session of a cigar up into the numbers shown on its profile. */
export function aggregate(reviews: Review[]): Aggregate {
  if (!reviews.length) {
    return { count: 0, ratings: null, overall: null, body: null, spicePct: null, flavorCounts: [] };
  }
  const n = reviews.length;
  const mean = (f: (r: Review) => number) => reviews.reduce((s, r) => s + f(r), 0) / n;
  const ratings = Object.fromEntries(RATING_FIELDS.map(({ key }) => [key, mean((r) => r.ratings[key])])) as unknown as Ratings;
  const overall = RATING_FIELDS.reduce((s, { key }) => s + ratings[key], 0) / RATING_FIELDS.length;
  const counts = new Map<string, number>();
  for (const r of reviews) for (const f of r.flavors) counts.set(f, (counts.get(f) ?? 0) + 1);
  return {
    count: n,
    ratings,
    overall,
    body: mean((r) => r.body),
    spicePct: (reviews.filter((r) => r.hasSpice).length / n) * 100,
    flavorCounts: [...counts.entries()].map(([noteId, count]) => ({ noteId, count })).sort((a, b) => b.count - a.count),
  };
}
