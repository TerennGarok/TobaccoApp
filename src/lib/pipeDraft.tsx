import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import type { PipeRatings } from '../db/pipe';

export interface PipeDraft {
  tobaccoId?: number;
  title: string;
  ratings: PipeRatings;
  strength: number;
  moisture: number;
  flavors: string[];
  pipe: string;
  pairing: string;
  occasion: string;
  durationMin?: number;
  notes: string;
  deductInventory: boolean;
}

const empty = (): PipeDraft => ({
  title: '',
  ratings: { flavor: 0, roomNote: 0, burn: 0, biteFree: 0, consistency: 0 },
  strength: 50,
  moisture: 50,
  flavors: [],
  pipe: '',
  pairing: '',
  occasion: '',
  notes: '',
  deductInventory: true,
});

const Ctx = createContext<{ draft: PipeDraft; update: (p: Partial<PipeDraft>) => void; start: (id: number, title: string) => void } | null>(null);

export function PipeDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<PipeDraft>(empty);
  const update = useCallback((p: Partial<PipeDraft>) => setDraft((d) => ({ ...d, ...p })), []);
  const start = useCallback((tobaccoId: number, title: string) => setDraft({ ...empty(), tobaccoId, title }), []);
  const value = useMemo(() => ({ draft, update, start }), [draft, update, start]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePipeDraft() {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePipeDraft outside provider');
  return c;
}
