// pdf.js (rendering) + pdf-lib (writing) shared helpers.
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };
export type { PDFDocumentProxy, PDFPageProxy };

const assetBase = new URL('./pdfjs/', document.baseURI).href;

export async function openPdfJs(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  // pdf.js transfers (detaches) the buffer it is given, so always pass a copy.
  const task = pdfjsLib.getDocument({
    data: bytes.slice(),
    password,
    cMapUrl: assetBase + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: assetBase + 'standard_fonts/',
    isEvalSupported: false,
  });
  return task.promise;
}

/** Open, prompting for a password if needed. */
export async function openPdfJsInteractive(bytes: Uint8Array, askPassword: (retry: boolean) => Promise<string | null>): Promise<{ doc: PDFDocumentProxy; password?: string }> {
  let password: string | undefined;
  let retry = false;
  for (;;) {
    try {
      const doc = await openPdfJs(bytes, password);
      return { doc, password };
    } catch (e: any) {
      if (e?.name === 'PasswordException') {
        const p = await askPassword(retry);
        if (p === null) throw new Error('Password required');
        password = p;
        retry = true;
        continue;
      }
      throw e;
    }
  }
}

export async function loadPdfLib(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

export async function renderPageToCanvas(page: PDFPageProxy, scale: number, canvas?: HTMLCanvasElement, forms = false): Promise<HTMLCanvasElement> {
  const vp = page.getViewport({ scale });
  const c = canvas || document.createElement('canvas');
  c.width = Math.max(1, Math.floor(vp.width));
  c.height = Math.max(1, Math.floor(vp.height));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({
    canvasContext: ctx,
    viewport: vp,
    annotationMode: forms ? pdfjsLib.AnnotationMode.ENABLE_FORMS : pdfjsLib.AnnotationMode.ENABLE,
  }).promise;
  return c;
}

export async function makeThumb(bytes: Uint8Array, width = 240): Promise<{ thumb: string; pages: number }> {
  const doc = await openPdfJs(bytes);
  try {
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const c = await renderPageToCanvas(page, width / vp1.width);
    return { thumb: c.toDataURL('image/jpeg', 0.7), pages: doc.numPages };
  } finally {
    doc.destroy();
  }
}

// ---- Text helpers for pdf-lib standard fonts (WinAnsi only) ----
const charsetCache = new WeakMap<PDFFont, Set<number>>();

export function sanitizeForFont(font: PDFFont, text: string): string {
  let set = charsetCache.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charsetCache.set(font, set);
  }
  const map: Record<string, string> = {
    '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', ' ': ' ', '\t': '    ',
  };
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (set.has(cp)) out += ch;
    else if (map[ch] && [...map[ch]].every((c) => set!.has(c.codePointAt(0)!))) out += map[ch];
    else if (ch === '\n' || ch === '\r') out += ch;
    else {
      // Strip accents as a fallback, else '?'
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base && [...base].every((c) => set!.has(c.codePointAt(0)!)) ? base : '?';
    }
  }
  return out;
}

export type FontFamily = 'sans' | 'serif' | 'mono';

export async function getStdFont(doc: PDFDocument, family: FontFamily, bold = false, italic = false): Promise<PDFFont> {
  const key = family + (bold ? 'B' : '') + (italic ? 'I' : '');
  const cache: Map<string, PDFFont> = ((doc as any).__fontCache ||= new Map());
  if (cache.has(key)) return cache.get(key)!;
  const table: Record<string, StandardFonts> = {
    sans: StandardFonts.Helvetica,
    sansB: StandardFonts.HelveticaBold,
    sansI: StandardFonts.HelveticaOblique,
    sansBI: StandardFonts.HelveticaBoldOblique,
    serif: StandardFonts.TimesRoman,
    serifB: StandardFonts.TimesRomanBold,
    serifI: StandardFonts.TimesRomanItalic,
    serifBI: StandardFonts.TimesRomanBoldItalic,
    mono: StandardFonts.Courier,
    monoB: StandardFonts.CourierBold,
    monoI: StandardFonts.CourierOblique,
    monoBI: StandardFonts.CourierBoldOblique,
  };
  const f = await doc.embedFont(table[key]);
  cache.set(key, f);
  return f;
}

export function cssFontFor(family: FontFamily) {
  return family === 'serif' ? '"Times New Roman", Times, serif' : family === 'mono' ? '"Courier New", Courier, monospace' : 'Helvetica, Arial, sans-serif';
}

export function hexToRgb01(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(v, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/jpeg', q = 0.88): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Canvas encode failed'))), type, q));
}

export async function canvasToBytes(c: HTMLCanvasElement, type = 'image/jpeg', q = 0.88): Promise<Uint8Array> {
  return new Uint8Array(await (await canvasToBlob(c, type, q)).arrayBuffer());
}

export const PAGE_SIZES: Record<string, [number, number]> = {
  letter: [612, 792],
  a4: [595.28, 841.89],
  legal: [612, 1008],
};
