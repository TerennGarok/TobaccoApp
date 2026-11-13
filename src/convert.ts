// Convert assorted file formats into PDF pages.
// Supported: PDF, images (JPG/PNG/WebP/GIF/BMP/HEIC where the browser decodes it/SVG),
// plain text-like files (TXT, MD, CSV, JSON, XML, LOG, code), HTML and Word (.docx).
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import { getStdFont, sanitizeForFont, PAGE_SIZES, canvasToBytes } from './pdf';
import { fileToCanvas } from './scanner/process';

export const IMPORT_ACCEPT =
  'application/pdf,image/*,.pdf,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.log,.html,.htm,.docx,.rtf,.js,.ts,.py,.java,.c,.cpp,.css,.yml,.yaml,.ini';

export type PageSizeKey = 'letter' | 'a4' | 'legal';

function ext(name: string) {
  const m = /\.([^.]+)$/.exec(name.toLowerCase());
  return m ? m[1] : '';
}

export function fileKind(f: File): 'pdf' | 'image' | 'docx' | 'html' | 'text' | 'unknown' {
  const e = ext(f.name);
  const t = f.type;
  if (t === 'application/pdf' || e === 'pdf') return 'pdf';
  if (t.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'svg', 'avif', 'tif', 'tiff'].includes(e)) return 'image';
  if (e === 'docx' || t.includes('officedocument.wordprocessingml')) return 'docx';
  if (e === 'html' || e === 'htm' || t === 'text/html') return 'html';
  if (t.startsWith('text/') || ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'log', 'rtf', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'css', 'yml', 'yaml', 'ini'].includes(e) || t === 'application/json') return 'text';
  return 'unknown';
}

/** Append pages generated from `files` into `doc`. Returns number of pages added. */
export async function appendFiles(doc: PDFDocument, files: File[], pageSize: PageSizeKey = 'letter', onProgress?: (msg: string) => void, password?: string): Promise<number> {
  let added = 0;
  for (const f of files) {
    onProgress?.(`Converting ${f.name}…`);
    const before = doc.getPageCount();
    switch (fileKind(f)) {
      case 'pdf': {
        const src = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()), { ignoreEncryption: true });
        const copied = await doc.copyPages(src, src.getPageIndices());
        copied.forEach((p) => doc.addPage(p));
        break;
      }
      case 'image':
        await addImagePage(doc, f, pageSize);
        break;
      case 'docx': {
        const mammoth: any = await import('mammoth');
        const res = await (mammoth.default || mammoth).convertToHtml({ arrayBuffer: await f.arrayBuffer() });
        await addHtml(doc, res.value, pageSize);
        break;
      }
      case 'html':
        await addHtml(doc, await f.text(), pageSize);
        break;
      case 'text': {
        const mono = ['csv', 'tsv', 'json', 'xml', 'log', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'css', 'yml', 'yaml', 'ini'].includes(ext(f.name));
        let text = await f.text();
        if (ext(f.name) === 'rtf') text = stripRtf(text);
        await addBlocks(doc, text.split(/\r?\n/).map((t) => ({ text: t, size: mono ? 9.5 : 11, mono, keepEmpty: true })), pageSize);
        break;
      }
      default:
        throw new Error(`Unsupported file type: ${f.name}`);
    }
    added += doc.getPageCount() - before;
  }
  void password;
  return added;
}

export async function filesToPdf(files: File[], pageSize: PageSizeKey = 'letter', onProgress?: (m: string) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setProducer('PocketPDF');
  await appendFiles(doc, files, pageSize, onProgress);
  if (!doc.getPageCount()) throw new Error('Nothing to convert');
  return doc.save();
}

async function addImagePage(doc: PDFDocument, f: Blob, pageSize: PageSizeKey) {
  let img;
  const t = f.type;
  if (t === 'image/jpeg') {
    try {
      // Re-encode through canvas so EXIF rotation is honoured.
      const c = await fileToCanvas(f, 4000);
      img = await doc.embedJpg(await canvasToBytes(c, 'image/jpeg', 0.9));
    } catch {
      img = await doc.embedJpg(new Uint8Array(await f.arrayBuffer()));
    }
  } else if (t === 'image/png') {
    img = await doc.embedPng(new Uint8Array(await f.arrayBuffer()));
  } else {
    const c = await fileToCanvas(f, 4000);
    img = await doc.embedJpg(await canvasToBytes(c, 'image/jpeg', 0.9));
  }
  const [a, b] = PAGE_SIZES[pageSize];
  const land = img.width > img.height;
  const [pw, ph] = land ? [b, a] : [a, b];
  const page = doc.addPage([pw, ph]);
  const m = 18;
  const s = Math.min((pw - m * 2) / img.width, (ph - m * 2) / img.height, 1.5);
  const w = img.width * s, hh = img.height * s;
  page.drawImage(img, { x: (pw - w) / 2, y: (ph - hh) / 2, width: w, height: hh });
}

// ---------------- simple flow layout engine ----------------

interface Block {
  text: string;
  size: number;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  indent?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  bullet?: string;
  keepEmpty?: boolean;
  image?: string; // data URL
  rule?: boolean;
}

async function addBlocks(doc: PDFDocument, blocks: Block[], pageSize: PageSizeKey) {
  const [pw, ph] = PAGE_SIZES[pageSize];
  const margin = 54;
  const maxW = pw - margin * 2;
  let page: PDFPage = doc.addPage([pw, ph]);
  let y = ph - margin;
  const newPage = () => {
    page = doc.addPage([pw, ph]);
    y = ph - margin;
  };
  for (const b of blocks) {
    if (b.rule) {
      if (y - 12 < margin) newPage();
      y -= 6;
      page.drawLine({ start: { x: margin, y }, end: { x: pw - margin, y }, thickness: 0.7, color: rgb(0.6, 0.6, 0.6) });
      y -= 8;
      continue;
    }
    if (b.image) {
      try {
        const bytes = dataUrlToBytes(b.image);
        const im = b.image.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const s = Math.min(1, maxW / im.width, (ph - margin * 2) / im.height);
        const w = im.width * s, hh = im.height * s;
        if (y - hh < margin) newPage();
        page.drawImage(im, { x: margin, y: y - hh, width: w, height: hh });
        y -= hh + 8;
      } catch {
        /* unsupported image */
      }
      continue;
    }
    const font: PDFFont = await getStdFont(doc, b.mono ? 'mono' : 'sans', !!b.bold, !!b.italic);
    const lh = b.size * 1.32;
    y -= b.spaceBefore || 0;
    const indent = (b.indent || 0) + (b.bullet ? 14 : 0);
    const text = sanitizeForFont(font, b.text);
    const lines = wrap(text, font, b.size, maxW - indent);
    if (!lines.length && b.keepEmpty) lines.push('');
    lines.forEach((ln, i) => {
      if (y - lh < margin) newPage();
      y -= lh;
      if (i === 0 && b.bullet) page.drawText(sanitizeForFont(font, b.bullet), { x: margin + (b.indent || 0), y: y + lh * 0.24, size: b.size, font });
      if (ln) page.drawText(ln, { x: margin + indent, y: y + lh * 0.24, size: b.size, font, color: rgb(0.08, 0.08, 0.1) });
    });
    y -= b.spaceAfter || 0;
  }
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const trial = line + w;
      if (font.widthOfTextAtSize(trial, size) <= maxW || !line.trim()) {
        if (font.widthOfTextAtSize(trial, size) > maxW && !line.trim()) {
          // hard-break very long word
          let chunk = '';
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxW) {
              out.push(chunk);
              chunk = '';
            }
            chunk += ch;
          }
          line = chunk;
        } else line = trial;
      } else {
        out.push(line.trimEnd());
        line = w.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out.length === 1 && out[0] === '' ? [] : out;
}

function dataUrlToBytes(u: string): Uint8Array {
  const b64 = u.slice(u.indexOf(',') + 1);
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function addHtml(doc: PDFDocument, html: string, pageSize: PageSizeKey) {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  dom.querySelectorAll('script,style,noscript,head').forEach((n) => n.remove());
  const blocks: Block[] = [];
  const inlineText = (n: Node): string => (n.textContent || '').replace(/\s+/g, ' ').trim();
  const walk = (el: Element, depth: number) => {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = (child.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) blocks.push({ text: t, size: 11, spaceAfter: 4 });
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const e = child as Element;
      const tag = e.tagName.toLowerCase();
      const hs: Record<string, number> = { h1: 22, h2: 18, h3: 15, h4: 13, h5: 12, h6: 11 };
      if (hs[tag]) blocks.push({ text: inlineText(e), size: hs[tag], bold: true, spaceBefore: 8, spaceAfter: 4 });
      else if (tag === 'p' || tag === 'blockquote' || tag === 'figcaption') {
        const imgs = e.querySelectorAll('img');
        imgs.forEach((im) => im.getAttribute('src')?.startsWith('data:') && blocks.push({ text: '', size: 11, image: im.getAttribute('src')! }));
        const t = inlineText(e);
        const strong = e.children.length === 1 && /^(strong|b)$/i.test(e.children[0].tagName) && inlineText(e.children[0]) === t;
        if (t) blocks.push({ text: t, size: 11, bold: strong, italic: tag === 'blockquote', indent: tag === 'blockquote' ? 18 : 0, spaceAfter: 6 });
      } else if (tag === 'ul' || tag === 'ol') {
        let i = 1;
        for (const li of Array.from(e.children)) {
          if (li.tagName.toLowerCase() !== 'li') continue;
          const nested = li.querySelector('ul,ol');
          const clone = li.cloneNode(true) as Element;
          clone.querySelectorAll('ul,ol').forEach((n) => n.remove());
          blocks.push({ text: inlineText(clone), size: 11, bullet: tag === 'ul' ? '•' : `${i}.`, indent: depth * 16, spaceAfter: 2 });
          if (nested) walk({ childNodes: [nested] } as any, depth + 1);
          i++;
        }
        blocks.push({ text: '', size: 4 });
      } else if (tag === 'table') {
        for (const tr of Array.from(e.querySelectorAll('tr'))) {
          const cells = Array.from(tr.children).map((c) => inlineText(c));
          blocks.push({ text: cells.join('  |  '), size: 9.5, bold: tr.querySelector('th') !== null, spaceAfter: 2 });
        }
        blocks.push({ text: '', size: 6 });
      } else if (tag === 'pre') {
        (e.textContent || '').split('\n').forEach((ln) => blocks.push({ text: ln, size: 9, mono: true, keepEmpty: true }));
      } else if (tag === 'img') {
        const src = e.getAttribute('src');
        if (src?.startsWith('data:image/')) blocks.push({ text: '', size: 11, image: src });
      } else if (tag === 'hr') blocks.push({ text: '', size: 11, rule: true });
      else if (tag === 'br') blocks.push({ text: '', size: 11, keepEmpty: true });
      else walk(e, depth);
    }
  };
  walk(dom.body, 0);
  if (!blocks.length) blocks.push({ text: '(empty document)', size: 11, italic: true });
  await addBlocks(doc, blocks, pageSize);
}

function stripRtf(rtf: string) {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\{\*?\\[^{}]+}|[{}]|\\\n?[A-Za-z]+\n?(?:-?\d+)?[ ]?/g, '')
    .trim();
}

export async function addBlankPage(doc: PDFDocument, index: number, size: [number, number]) {
  doc.insertPage(index, size);
}
