// OCR via Tesseract.js (WASM, runs on-device). Language data is downloaded on
// first use and cached by the service worker for offline use afterwards.
import type { Worker } from 'tesseract.js';
import { PDFDocument, PDFPage, degrees, rgb } from 'pdf-lib';
import { getStdFont, sanitizeForFont } from './pdf';

export const OCR_LANGS: { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
  { code: 'pol', label: 'Polish' },
  { code: 'tur', label: 'Turkish' },
  { code: 'vie', label: 'Vietnamese' },
];

export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
}

let worker: Worker | null = null;
let workerLang = '';
let progressCb: ((p: number, status: string) => void) | null = null;

export function getOcrLang() {
  return localStorage.getItem('ocrLang') || 'eng';
}
export function setOcrLang(l: string) {
  localStorage.setItem('ocrLang', l);
}

async function getWorker(lang: string): Promise<Worker> {
  if (worker && workerLang === lang) return worker;
  if (worker) {
    await worker.terminate();
    worker = null;
  }
  const { createWorker } = await import('tesseract.js');
  const base = new URL('./tesseract/', document.baseURI).href;
  worker = await createWorker(lang, 1, {
    workerPath: base + 'worker.min.js',
    corePath: base,
    workerBlobURL: false,
    // English ships with the app; other languages download once from the CDN.
    langPath: lang === 'eng' ? base + 'lang' : `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int`,
    logger: (m: any) => progressCb?.(m.progress ?? 0, m.status ?? ''),
  });
  workerLang = lang;
  return worker;
}

export async function recognizeCanvas(canvas: HTMLCanvasElement, lang = getOcrLang(), onProgress?: (p: number, status: string) => void): Promise<OcrResult> {
  progressCb = onProgress || null;
  try {
    const w = await getWorker(lang);
    const res: any = await w.recognize(canvas);
    const words: OcrWord[] = (res.data.words || [])
      .filter((wd: any) => wd.text && wd.text.trim() && wd.confidence > 20)
      .map((wd: any) => ({ text: wd.text.trim(), x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1, confidence: wd.confidence }));
    return { text: res.data.text || '', words };
  } finally {
    progressCb = null;
  }
}

export async function terminateOcr() {
  if (worker) await worker.terminate();
  worker = null;
}

/**
 * Add an invisible, selectable/searchable text layer to a page.
 * `map` converts canvas pixel coords -> PDF user-space coords.
 * `rotation` is the page /Rotate so text runs in the displayed direction.
 */
export async function addTextLayer(doc: PDFDocument, page: PDFPage, words: OcrWord[], map: (x: number, y: number) => [number, number], rotation = 0) {
  const font = await getStdFont(doc, 'sans');
  for (const wd of words) {
    const text = sanitizeForFont(font, wd.text).replace(/[\r\n]/g, ' ');
    if (!text.trim()) continue;
    // baseline-left in canvas coords: (x0, y1 - descent)
    const hPx = wd.y1 - wd.y0;
    const [bx, by] = map(wd.x0, wd.y1 - hPx * 0.18);
    const [rx, ry] = map(wd.x1, wd.y1 - hPx * 0.18);
    const widthPt = Math.hypot(rx - bx, ry - by);
    const unit = font.widthOfTextAtSize(text, 1);
    if (!unit || widthPt <= 0) continue;
    const [tx, ty] = map(wd.x0, wd.y0);
    const [ux, uy] = map(wd.x0, wd.y1);
    const heightPt = Math.hypot(ux - tx, uy - ty);
    const size = Math.max(1, Math.min(widthPt / unit, heightPt * 1.6));
    try {
      page.drawText(text, { x: bx, y: by, size, font, color: rgb(0, 0, 0), opacity: 0, rotate: degrees(rotation) });
    } catch {
      /* skip characters the font can't encode */
    }
  }
}
