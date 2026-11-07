// Identification service for the Humidor app.
//
// POST /identify  { image: <base64>, mediaType: "image/jpeg" }
//   → IdentificationResult (see src/lib/types.ts in the app)
//
// Claude reads the band in the photo, researches the cigar on the web
// (manufacturer pages, retailers, review sites), and reports back through a
// strict `submit_identification` tool so the response always matches the
// schema the app expects. The API key stays on this server.
import Anthropic from '@anthropic-ai/sdk';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const client = new Anthropic();
const MODEL = 'claude-opus-5-5';
const PORT = Number(process.env.PORT ?? 8787);

const FLAVOR_IDS = [
  'earth', 'soil', 'leather', 'mineral', 'salt', 'mushroom', 'barnyard', 'musty',
  'cedar', 'oak', 'hickory', 'charred-wood', 'sandalwood', 'pine',
  'black-pepper', 'red-pepper', 'white-pepper', 'cinnamon', 'nutmeg', 'clove', 'baking-spice', 'anise', 'ginger', 'cardamom',
  'honey', 'caramel', 'molasses', 'brown-sugar', 'vanilla', 'toffee', 'maple', 'butterscotch', 'marzipan',
  'coffee', 'espresso', 'mocha', 'cocoa', 'dark-chocolate', 'milk-chocolate',
  'almond', 'cashew', 'walnut', 'peanut', 'chestnut', 'hazelnut', 'pecan',
  'cream', 'butter', 'buttered-popcorn', 'custard',
  'toast', 'bread', 'graham-cracker', 'cereal', 'malt', 'biscuit',
  'dried-fruit', 'raisin', 'dark-fruit', 'cherry', 'fig', 'date', 'plum', 'citrus', 'orange-peel', 'apricot',
  'floral', 'hay', 'grass', 'tea', 'herbal', 'mint', 'licorice',
  'smoke', 'tobacco', 'roasted', 'char', 'barbecue', 'metallic',
];

const str = { type: 'string' } as const;
const optStr = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const optNum = { anyOf: [{ type: 'number' }, { type: 'null' }] } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object' as const,
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const SUBMIT_TOOL: Anthropic.Beta.BetaTool = {
  name: 'submit_identification',
  description:
    'Report the identified cigar(s). Call exactly once, after researching, with the best 1-3 candidates ordered by confidence.',
  strict: true,
  input_schema: obj({
    bandText: optStr,
    candidates: {
      type: 'array',
      items: obj({
        brand: str,
        line: str,
        manufacturer: optStr,
        wrapper: optStr,
        binder: optStr,
        filler: optStr,
        origin: optStr,
        strength: { anyOf: [{ type: 'string', enum: ['mild', 'mild-medium', 'medium', 'medium-full', 'full'] }, { type: 'null' }] },
        description: optStr,
        confidence: { type: 'number' },
        vitolas: {
          type: 'array',
          items: obj({ name: str, lengthIn: { type: 'number' }, ringGauge: { type: 'integer' }, shape: optStr }),
        },
        flavorSuggestions: {
          type: 'array',
          items: obj({
            noteId: { type: 'string', enum: FLAVOR_IDS },
            source: { type: 'string', enum: ['manufacturer', 'reviews', 'both'] },
          }),
        },
        externalReviews: {
          type: 'array',
          items: obj({ source: str, url: optStr, score: optNum, scale: optNum, summary: optStr }),
        },
        sourceUrls: { type: 'array', items: str },
      }),
    },
  }) as Anthropic.Beta.BetaTool['input_schema'],
};

const SYSTEM = `You identify cigars from photos of their bands for a cigar journal app.

1. Read every word, logo and color cue on the band(s). Secondary and foot bands often name the line.
2. Research the cigar on the web: the manufacturer's site first, then major retailers and review sites.
3. List EVERY currently produced vitola (size) of the identified line with length in inches and ring gauge — the photo cannot show size, so the user picks from your list. Include limited or lounge sizes if well documented. Do not invent sizes.
4. Flavor suggestions use only the allowed note ids. Mark "manufacturer" for notes the maker or official copy claims, "reviews" for notes repeatedly reported by reviewers, "both" when they agree. Prefer 4-10 notes that are actually characteristic.
5. External reviews: published scores (e.g. Cigar Aficionado, Halfwheel, Cigar Dojo, Cigar Journal) and retailer customer averages, with URLs.
6. If the band is ambiguous (several lines share a band), return up to 3 candidates with honest confidence values (0-1).
Then call submit_identification once. Null any field you could not verify rather than guessing.`;

async function identify(image: string, mediaType: string) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: image } },
        { type: 'text', text: 'Identify this cigar and research it.' },
      ],
    },
  ];

  // Server-side web search may pause long turns (pause_turn); resume until the
  // model calls submit_identification.
  for (let turn = 0; turn < 6; turn++) {
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: SYSTEM,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }, SUBMIT_TOOL],
        messages,
      })
      .finalMessage();

    if (response.stop_reason === 'refusal') throw new HttpError(422, 'The request was declined.');
    const submit = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === 'submit_identification',
    );
    if (submit) return submit.input;

    messages.push({ role: 'assistant', content: response.content });
    if (response.stop_reason !== 'pause_turn') {
      messages.push({ role: 'user', content: 'Please call submit_identification with your findings now.' });
    }
  }
  throw new HttpError(502, 'Identification did not complete.');
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function readJson(req: IncomingMessage, limit = 15 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Image too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, null);
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || req.url !== '/identify') return send(res, 404, { error: 'Not found' });
  try {
    const body = (await readJson(req)) as { image?: unknown; mediaType?: unknown };
    if (typeof body.image !== 'string' || !body.image) throw new HttpError(400, 'image (base64) is required');
    const mediaType = typeof body.mediaType === 'string' ? body.mediaType : 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)) throw new HttpError(400, 'Unsupported image type');
    send(res, 200, await identify(body.image, mediaType));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    if (e instanceof Anthropic.RateLimitError) return send(res, 503, { error: 'Busy — try again shortly' });
    if (e instanceof Anthropic.APIError) {
      console.error('Claude API error', e.status, e.message);
      return send(res, 502, { error: 'Upstream error' });
    }
    console.error(e);
    send(res, 500, { error: 'Internal error' });
  }
}).listen(PORT, () => console.log(`identify server on :${PORT}`));
