// What we ask Claude about a cigar band, and how we read the answer back.
// Used by both paths: the free hand-off to the Claude app (copy/paste) and the
// automatic Anthropic API lookup.
import { ALL_NOTES, normalizeFlavor } from '../data/flavors';
import type { CigarCandidate, FlavorSuggestion, IdentificationResult, Strength, Vitola } from './types';

export const FLAVOR_IDS = ALL_NOTES.map((n) => n.id);

export const RESEARCH_INSTRUCTIONS = `You identify cigars from photos of their bands for a cigar journal app.

1. Read every word, logo and color cue on the band(s). Secondary and foot bands often name the line.
2. Research the cigar on the web: the manufacturer's site first, then major retailers and review sites.
3. List EVERY currently produced vitola (size) of the identified line with length in inches and ring gauge — the photo cannot show size, so the user picks from your list. Do not invent sizes.
4. Flavor notes: mark "manufacturer" for notes the maker claims, "reviews" for notes reviewers repeatedly report, "both" when they agree. 4–10 characteristic notes, using only these ids: ${FLAVOR_IDS.join(', ')}.
5. External reviews: published scores (e.g. Cigar Aficionado, Halfwheel, Cigar Journal) and retailer customer averages, with URLs.
6. If the band is ambiguous, give up to 3 candidates with honest confidence (0–1). Use null for anything you could not verify rather than guessing.`;

const SHAPE = `{
  "bandText": "words read on the band",
  "candidates": [{
    "brand": "", "line": "", "manufacturer": null, "wrapper": null, "binder": null, "filler": null, "origin": null,
    "strength": "mild | mild-medium | medium | medium-full | full | null",
    "description": null, "confidence": 0.9,
    "vitolas": [{ "name": "Robusto", "lengthIn": 5, "ringGauge": 50, "shape": null }],
    "flavorSuggestions": [{ "noteId": "cocoa", "source": "manufacturer | reviews | both" }],
    "externalReviews": [{ "source": "", "url": null, "score": null, "scale": null, "summary": null }],
    "sourceUrls": []
  }]
}`;

/** Prompt pasted into the Claude app alongside the band photo. */
export const CHAT_PROMPT = `${RESEARCH_INSTRUCTIONS}

Please search the web, then reply with ONLY a JSON code block in exactly this shape (my app reads it):
${SHAPE}`;

const STRENGTHS: Strength[] = ['mild', 'mild-medium', 'medium', 'medium-full', 'full'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : undefined);

/** Find the first JSON object in a chat reply (inside ```json fences or bare). */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1));
    } catch {
      // try the next candidate
    }
  }
  throw new Error("Couldn't find the cigar details in that text. Copy Claude's whole reply and try again.");
}

/** Validate and normalise whatever Claude returned into the app's types. */
export function normalizeResult(raw: unknown): IdentificationResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(obj.candidates) ? obj.candidates : [obj];
  const candidates: CigarCandidate[] = [];
  for (const item of list) {
    const c = (item ?? {}) as Record<string, unknown>;
    const brand = str(c.brand);
    const line = str(c.line);
    if (!brand || !line) continue;
    const vitolas: Vitola[] = (Array.isArray(c.vitolas) ? c.vitolas : [])
      .map((v) => {
        const o = (v ?? {}) as Record<string, unknown>;
        const name = str(o.name);
        const lengthIn = num(o.lengthIn);
        const ringGauge = num(o.ringGauge);
        if (!name || !lengthIn || !ringGauge) return null;
        const shape = str(o.shape);
        return { name, lengthIn, ringGauge: Math.round(ringGauge), ...(shape ? { shape } : {}) };
      })
      .filter((v): v is Vitola => !!v)
      .sort((a, b) => a.lengthIn - b.lengthIn || a.ringGauge - b.ringGauge);
    const flavors = new Map<string, FlavorSuggestion>();
    for (const f of Array.isArray(c.flavorSuggestions) ? c.flavorSuggestions : []) {
      const o = (f ?? {}) as Record<string, unknown>;
      const id = normalizeFlavor(String(o.noteId ?? ''));
      if (!id) continue;
      const source = o.source === 'manufacturer' || o.source === 'reviews' ? o.source : 'both';
      const prev = flavors.get(id);
      flavors.set(id, { noteId: id, source: prev && prev.source !== source ? 'both' : source });
    }
    const strength = STRENGTHS.find((s) => s === String(c.strength ?? '').toLowerCase().replace(/[\s–—/]+/g, '-'));
    candidates.push({
      brand,
      line,
      manufacturer: str(c.manufacturer),
      wrapper: str(c.wrapper),
      binder: str(c.binder),
      filler: str(c.filler),
      origin: str(c.origin),
      strength,
      description: str(c.description),
      confidence: Math.min(1, Math.max(0, num(c.confidence) ?? 0.7)),
      vitolas,
      flavorSuggestions: [...flavors.values()],
      externalReviews: (Array.isArray(c.externalReviews) ? c.externalReviews : [])
        .map((r) => {
          const o = (r ?? {}) as Record<string, unknown>;
          const source = str(o.source);
          return source ? { source, url: str(o.url), score: num(o.score), scale: num(o.scale), summary: str(o.summary) } : null;
        })
        .filter((r): r is NonNullable<typeof r> => !!r),
      sourceUrls: (Array.isArray(c.sourceUrls) ? c.sourceUrls : []).map(str).filter((u): u is string => !!u),
    });
  }
  if (!candidates.length) throw new Error('Claude’s answer didn’t include a brand and line.');
  return { bandText: str(obj.bandText), candidates };
}

export function parseClaudeAnswer(text: string): IdentificationResult {
  return normalizeResult(extractJson(text));
}
