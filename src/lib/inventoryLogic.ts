import type { Vitola } from './types';

interface LotLike {
  quantity: number;
  vitola?: Vitola;
}

/** The lot a just-logged smoke comes out of: same size if known, oldest purchase first. */
export function pickLotToDeduct<T extends LotLike>(lots: T[], vitola?: Vitola): T | undefined {
  const sameSize = vitola ? lots.filter((l) => l.vitola?.name === vitola.name) : [];
  return (sameSize.length ? sameSize : lots).find((l) => l.quantity >= 1);
}

export function restingLabel(acquiredAt: string, at = new Date()): string {
  const days = Math.max(0, Math.floor((at.getTime() - new Date(acquiredAt).getTime()) / 86_400_000));
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  if (days < 730) return `${Math.floor(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}
