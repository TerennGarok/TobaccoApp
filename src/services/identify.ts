// Cigar identification — free by default.
//
//  1. LocalIdentifier (always): reads the band with on-device OCR and matches
//     the text against the catalog (shared Google Sheet + your journal +
//     built-in samples). No network, no cost.
//  2. RemoteIdentifier (optional, for later/paid phases): POSTs the photo to
//     server/ where Claude reads the band and researches it on the web. Only
//     used when EXPO_PUBLIC_IDENTIFY_URL is set.
import type { CigarCandidate, IdentificationResult } from '../lib/types';
import { normalizeFlavor } from '../data/flavors';
import { matchCatalog } from '../lib/match';
import { loadCatalog } from './catalog';
import { readBandText } from './ocr';
import { readBase64 } from './photos';

export interface Identifier {
  readonly name: string;
  readonly needsNetwork: boolean;
  identify(imageUri: string): Promise<IdentificationResult>;
}

const BACKEND_URL = process.env.EXPO_PUBLIC_IDENTIFY_URL;

/** Best guess when the band text matches nothing we know: offer it for editing. */
function guessFromText(lines: string[]): CigarCandidate | null {
  const words = lines.filter((l) => /[a-z]{3,}/i.test(l)).slice(0, 2);
  if (!words.length) return null;
  return {
    brand: words[0],
    line: words[1] ?? '',
    vitolas: [],
    flavorSuggestions: [],
    externalReviews: [],
    confidence: 0.1,
  };
}

class LocalIdentifier implements Identifier {
  readonly name = 'local';
  readonly needsNetwork = false;
  async identify(imageUri: string): Promise<IdentificationResult> {
    const lines = await readBandText(imageUri);
    const catalog = await loadCatalog();
    const candidates = matchCatalog(lines, catalog);
    if (!candidates.length) {
      const guess = guessFromText(lines);
      if (guess) candidates.push(guess);
    }
    return { bandText: lines.join(' · ') || undefined, candidates };
  }
}

class RemoteIdentifier implements Identifier {
  readonly name = 'remote';
  readonly needsNetwork = true;
  constructor(private url: string, private fallback: Identifier) {}

  async identify(imageUri: string): Promise<IdentificationResult> {
    const local = await this.fallback.identify(imageUri);
    if (local.candidates[0]?.confidence >= 0.8 && local.candidates[0].vitolas.length) return local;
    const image = await readBase64(imageUri);
    const res = await fetch(`${this.url.replace(/\/$/, '')}/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: image.data, mediaType: image.mediaType }),
    });
    if (!res.ok) throw new Error(`Identification service returned ${res.status}`);
    return sanitize((await res.json()) as IdentificationResult);
  }
}

/** Keep only flavor ids the app knows, and de-duplicate them. */
function sanitize(result: IdentificationResult): IdentificationResult {
  return {
    ...result,
    candidates: (result.candidates ?? []).map((c) => {
      const seen = new Map<string, (typeof c.flavorSuggestions)[number]>();
      for (const s of c.flavorSuggestions ?? []) {
        const id = normalizeFlavor(s.noteId);
        if (!id) continue;
        const prev = seen.get(id);
        seen.set(id, { noteId: id, source: prev && prev.source !== s.source ? 'both' : s.source });
      }
      return {
        ...c,
        vitolas: [...(c.vitolas ?? [])].sort((a, b) => a.lengthIn - b.lengthIn || a.ringGauge - b.ringGauge),
        flavorSuggestions: [...seen.values()],
        externalReviews: c.externalReviews ?? [],
      };
    }),
  };
}

const local = new LocalIdentifier();
export const identifier: Identifier = BACKEND_URL ? new RemoteIdentifier(BACKEND_URL, local) : local;

/** Search the catalog by typed text — the fallback when OCR isn't available or is wrong. */
export async function searchCatalog(query: string): Promise<CigarCandidate[]> {
  if (query.trim().length < 2) return [];
  return matchCatalog([query], await loadCatalog(), 8);
}
