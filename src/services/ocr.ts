// On-device text recognition (Google ML Kit on Android, Apple Vision on iOS).
// Free, private and works offline. Needs a development build — Expo Go and
// the web don't include the native module, in which case we return [] and the
// verify screen falls back to "type what the band says".
type Extractor = { isSupported: boolean; extractTextFromImage(uri: string): Promise<string[]> };

let mod: Extractor | null | undefined;

function load(): Extractor | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-text-extractor') as Extractor;
  } catch {
    mod = null;
  }
  return mod;
}

export function ocrAvailable(): boolean {
  return !!load()?.isSupported;
}

export async function readBandText(uri: string): Promise<string[]> {
  const m = load();
  if (!m?.isSupported) return [];
  try {
    return (await m.extractTextFromImage(uri)).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
