// Cigar identification.
//
// Two providers sit behind one interface:
//  • RemoteIdentifier — POSTs the band photo to the app's backend (server/),
//    which asks Claude to read the band and research the cigar on the web:
//    brand, line, every current vitola, manufacturer tasting notes, and what
//    reviewers report. API keys never ship inside the app.
//  • DemoIdentifier — offline stand-in that matches against a tiny built-in
//    catalog so the app can be tried before the backend is deployed.
import type { IdentificationResult } from '../lib/types';
import { SAMPLE_CATALOG } from '../data/sampleCatalog';
import { normalizeFlavor } from '../data/flavors';
import { readBase64 } from './photos';

export interface Identifier {
  readonly name: string;
  identify(imageUri: string): Promise<IdentificationResult>;
}

const BACKEND_URL = process.env.EXPO_PUBLIC_IDENTIFY_URL;

class RemoteIdentifier implements Identifier {
  readonly name = 'remote';
  constructor(private url: string) {}

  async identify(imageUri: string): Promise<IdentificationResult> {
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

class DemoIdentifier implements Identifier {
  readonly name = 'demo';
  async identify(): Promise<IdentificationResult> {
    await new Promise((r) => setTimeout(r, 900));
    // Without OCR we can't read the band; offer the sample catalog as
    // candidates so the verification step can be exercised.
    return { bandText: undefined, candidates: SAMPLE_CATALOG };
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

export const identifier: Identifier = BACKEND_URL ? new RemoteIdentifier(BACKEND_URL) : new DemoIdentifier();
export const isDemoIdentifier = !BACKEND_URL;
