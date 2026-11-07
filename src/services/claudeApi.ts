// Automatic band lookup: the app calls the Anthropic API directly with your
// own key (kept in the phone's secure storage), so no server is needed.
// Billed per lookup to your Anthropic API account — separate from a claude.ai plan.
import Anthropic from '@anthropic-ai/sdk';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { FLAVOR_IDS, normalizeResult, RESEARCH_INSTRUCTIONS } from '../lib/claudePrompt';
import type { IdentificationResult } from '../lib/types';
import { getSettings, saveSettings } from '../db/settings';

const KEY = 'anthropicApiKey';

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5', note: 'Most thorough' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', note: 'Balanced' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', note: 'Fastest, lowest cost' },
] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number]['id'];

// Web has no secure enclave; fall back to app settings (stays in this browser).
export async function getApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') return (await getSettings()).webApiKey || null;
  return SecureStore.getItemAsync(KEY);
}

export async function setApiKey(value: string | null): Promise<void> {
  const v = value?.trim() || null;
  if (Platform.OS === 'web') return saveSettings({ webApiKey: v ?? '' });
  if (v) await SecureStore.setItemAsync(KEY, v);
  else await SecureStore.deleteItemAsync(KEY);
}

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
  description: 'Report the identified cigar(s). Call exactly once, after researching, with the best 1-3 candidates ordered by confidence.',
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
        vitolas: { type: 'array', items: obj({ name: str, lengthIn: { type: 'number' }, ringGauge: { type: 'integer' }, shape: optStr }) },
        flavorSuggestions: {
          type: 'array',
          items: obj({ noteId: { type: 'string', enum: FLAVOR_IDS }, source: { type: 'string', enum: ['manufacturer', 'reviews', 'both'] } }),
        },
        externalReviews: { type: 'array', items: obj({ source: str, url: optStr, score: optNum, scale: optNum, summary: optStr }) },
        sourceUrls: { type: 'array', items: str },
      }),
    },
  }) as Anthropic.Beta.BetaTool['input_schema'],
};

export class ClaudeLookupError extends Error {}

export async function lookupWithClaude(image: { data: string; mediaType: string }): Promise<IdentificationResult> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new ClaudeLookupError('Add an Anthropic API key in Settings to use automatic lookup.');
  const model = ((await getSettings()).claudeModel || 'claude-opus-5-5') as ClaudeModel;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: 180_000 });

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType as 'image/jpeg', data: image.data } },
        { type: 'text', text: 'Identify this cigar and research it, then call submit_identification.' },
      ],
    },
  ];

  try {
    // Web search can pause long turns (pause_turn); resume until the tool is called.
    for (let turn = 0; turn < 5; turn++) {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        // Server-side fallback re-runs a declined request on another model (not offered for Haiku).
        ...(model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
        output_config: { effort: 'medium' },
        system: RESEARCH_INSTRUCTIONS,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }, SUBMIT_TOOL],
        messages,
      });
      if (response.stop_reason === 'refusal') throw new ClaudeLookupError('Claude declined this lookup.');
      const submit = response.content.find(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === 'submit_identification',
      );
      if (submit) return normalizeResult(submit.input);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason !== 'pause_turn') messages.push({ role: 'user', content: 'Please call submit_identification with your findings now.' });
    }
    throw new ClaudeLookupError('Claude did not finish the lookup.');
  } catch (e) {
    if (e instanceof ClaudeLookupError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ClaudeLookupError('The API key was rejected — check it in Settings.');
    if (e instanceof Anthropic.RateLimitError) throw new ClaudeLookupError('Claude is busy or your API limit was reached — try again shortly.');
    if (e instanceof Anthropic.APIConnectionError) throw new ClaudeLookupError('No connection to Claude.');
    if (e instanceof Anthropic.APIError) throw new ClaudeLookupError(`Claude API error (${e.status}).`);
    throw e;
  }
}
