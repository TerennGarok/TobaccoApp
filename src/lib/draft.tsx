// In-progress review, shared across the wizard pages
// (Identify → Ratings → Character → Flavors → Notes).
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import type { CigarCandidate, FlavorSuggestion, Ratings, Vitola } from './types';
import { strengthToBody } from './types';

export interface Draft {
  queueId?: number;
  imageUri?: string;
  cigar?: CigarCandidate;
  vitola?: Vitola;
  ratings: Ratings;
  hasSpice: boolean;
  body: number;
  flavors: string[];
  suggestions: FlavorSuggestion[];
  notes: string;
  pairing: string;
  occasion: string;
  durationMin?: number;
  /** Take one stick out of inventory when saving (if you have any). */
  deductInventory: boolean;
}

const empty = (): Draft => ({
  ratings: { flavor: 0, aroma: 0, burn: 0, construction: 0, draw: 0 },
  hasSpice: false,
  body: 50,
  flavors: [],
  suggestions: [],
  notes: '',
  pairing: '',
  occasion: '',
  deductInventory: true,
});

interface Ctx {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  /** Start a review once the cigar & size are verified; pre-fills from catalog data. */
  begin: (args: { cigar: CigarCandidate; vitola?: Vitola; imageUri?: string; queueId?: number }) => void;
  reset: () => void;
}

const DraftContext = createContext<Ctx | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(empty);
  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const reset = useCallback(() => setDraft(empty()), []);
  const begin = useCallback<Ctx['begin']>(({ cigar, vitola, imageUri, queueId }) => {
    const spicy = cigar.flavorSuggestions.some((s) =>
      ['black-pepper', 'red-pepper', 'white-pepper', 'cinnamon', 'nutmeg', 'clove', 'baking-spice', 'ginger', 'cardamom', 'anise'].includes(s.noteId),
    );
    setDraft({
      ...empty(),
      cigar,
      vitola,
      imageUri,
      queueId,
      body: strengthToBody(cigar.strength),
      hasSpice: spicy,
      suggestions: cigar.flavorSuggestions,
      flavors: cigar.flavorSuggestions.map((s) => s.noteId),
    });
  }, []);
  const value = useMemo(() => ({ draft, update, begin, reset }), [draft, update, begin, reset]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): Ctx {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useDraft must be used inside DraftProvider');
  return ctx;
}
