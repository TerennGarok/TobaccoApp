export type Strength = 'mild' | 'mild-medium' | 'medium' | 'medium-full' | 'full';

/** Where a suggested flavor came from — drives the color coding in the UI. */
export type FlavorSource = 'manufacturer' | 'reviews' | 'both';

export interface FlavorSuggestion {
  noteId: string;
  source: FlavorSource;
}

/** One size/shape ("vitola") of a cigar line. */
export interface Vitola {
  name: string;
  lengthIn: number;
  ringGauge: number;
  shape?: string; // parejo, torpedo, belicoso, perfecto, box-pressed…
}

export interface ExternalReview {
  source: string; // "Cigar Aficionado", "Halfwheel", "Famous Smoke user reviews"…
  url?: string;
  score?: number;
  scale?: number; // e.g. 100 or 5
  summary?: string;
}

export interface CigarCandidate {
  brand: string;
  line: string;
  manufacturer?: string;
  wrapper?: string;
  binder?: string;
  filler?: string;
  origin?: string;
  strength?: Strength;
  description?: string;
  vitolas: Vitola[];
  flavorSuggestions: FlavorSuggestion[];
  externalReviews: ExternalReview[];
  /** 0..1 — how sure the identifier is that this is the cigar in the photo. */
  confidence: number;
  sourceUrls?: string[];
}

export interface IdentificationResult {
  bandText?: string;
  candidates: CigarCandidate[];
}

export interface Cigar extends Omit<CigarCandidate, 'confidence'> {
  id: number;
  imageUri?: string;
  createdAt: string;
}

export interface Ratings {
  flavor: number;
  aroma: number;
  burn: number;
  construction: number;
  draw: number; // "pull"
}

export interface Review {
  id: number;
  cigarId: number;
  vitola?: Vitola;
  smokedAt: string;
  ratings: Ratings;
  hasSpice: boolean;
  /** 0 = mild … 100 = full bodied */
  body: number;
  flavors: string[]; // note ids the smoker confirmed
  notes: string;
  pairing: string;
  occasion: string;
  durationMin?: number;
}

export type QueueStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'confirmed';

export interface QueueItem {
  id: number;
  imageUri: string;
  status: QueueStatus;
  result?: IdentificationResult;
  error?: string;
  attempts: number;
  createdAt: string;
}

export const RATING_FIELDS: { key: keyof Ratings; label: string; hint: string }[] = [
  { key: 'flavor', label: 'Flavor', hint: 'Depth, balance and complexity on the palate' },
  { key: 'aroma', label: 'Aroma', hint: 'Pre-light and the smoke in the room' },
  { key: 'burn', label: 'Burn', hint: 'Even line, needed touch-ups, ash' },
  { key: 'construction', label: 'Construction', hint: 'Roll, wrapper condition, firmness' },
  { key: 'draw', label: 'Draw', hint: 'Resistance of the pull' },
];

export const STRENGTH_LABELS: Record<Strength, string> = {
  mild: 'Mild',
  'mild-medium': 'Mild–Medium',
  medium: 'Medium',
  'medium-full': 'Medium–Full',
  full: 'Full',
};

export function bodyLabel(body: number): string {
  if (body < 20) return 'Mild';
  if (body < 40) return 'Mild–Medium';
  if (body < 60) return 'Medium';
  if (body < 80) return 'Medium–Full';
  return 'Full';
}

export function strengthToBody(s?: Strength): number {
  return s ? { mild: 10, 'mild-medium': 30, medium: 50, 'medium-full': 70, full: 90 }[s] : 50;
}

export function formatVitola(v: Vitola): string {
  const len = String(Number(v.lengthIn.toFixed(3))); // 6.125 stays 6.125, 5.50 → 5.5
  return `${v.name} · ${len}" × ${v.ringGauge}`;
}
