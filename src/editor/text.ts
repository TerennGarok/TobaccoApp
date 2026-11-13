// Text extraction into positioned lines (used for text editing and search).
import { pdfjsLib, PDFPageProxy, FontFamily } from '../pdf';

export interface TextLine {
  x: number;
  y: number;
  w: number;
  h: number;
  baseline: number;
  size: number;
  text: string;
  font: FontFamily;
  bold: boolean;
}

export async function getTextLines(page: PDFPageProxy): Promise<TextLine[]> {
  const vp = page.getViewport({ scale: 1 });
  const tc: any = await page.getTextContent();
  const styles = tc.styles || {};
  interface Run { x: number; base: number; w: number; size: number; str: string; font: FontFamily; bold: boolean }
  const runs: Run[] = [];
  for (const it of tc.items as any[]) {
    if (!('str' in it) || !it.str) continue;
    const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
    const angle = Math.atan2(tx[1], tx[0]);
    if (Math.abs(angle) > 0.02) continue; // only horizontal (as displayed) text is editable
    const size = Math.hypot(tx[2], tx[3]);
    if (size < 1) continue;
    const st = styles[it.fontName] || {};
    const fam: string = (st.fontFamily || '').toLowerCase();
    const font: FontFamily = fam.includes('mono') ? 'mono' : fam.includes('serif') && !fam.includes('sans') ? 'serif' : 'sans';
    const bold = /bold|black|heavy/i.test(it.fontName + ' ' + (st.fontFamily || ''));
    // item.width is in user-space units, which equal display units at scale 1
    const w = it.width;
    runs.push({ x: tx[4], base: tx[5], w: Math.max(w, 1), size, str: it.str, font, bold });
  }
  runs.sort((a, b) => (Math.abs(a.base - b.base) < a.size * 0.3 ? a.x - b.x : a.base - b.base));
  const lines: TextLine[] = [];
  let cur: (TextLine & { end: number }) | null = null;
  for (const r of runs) {
    if (cur && Math.abs(r.base - cur.baseline) < cur.size * 0.3 && r.x - cur.end < cur.size * 1.2 && r.x - cur.end > -cur.size * 0.5) {
      const gap = r.x - cur.end;
      const needSpace = gap > cur.size * 0.18 && !cur.text.endsWith(' ') && !r.str.startsWith(' ');
      cur.text += (needSpace ? ' ' : '') + r.str;
      cur.end = Math.max(cur.end, r.x + r.w);
      cur.w = cur.end - cur.x;
      continue;
    }
    if (cur) lines.push(cur);
    cur = { x: r.x, y: r.base - r.size * 0.88, w: r.w, h: r.size * 1.12, baseline: r.base, size: r.size, text: r.str, font: r.font, bold: r.bold, end: r.x + r.w };
  }
  if (cur) lines.push(cur);
  return lines.filter((l) => l.text.trim()).map(({ x, y, w, h, baseline, size, text, font, bold }) => ({ x, y, w, h, baseline, size, text: text.replace(/\s+$/, ''), font, bold }));
}

export async function getPageText(page: PDFPageProxy): Promise<string> {
  const lines = await getTextLines(page);
  return lines.map((l) => l.text).join('\n');
}
