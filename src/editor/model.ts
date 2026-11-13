// Editable overlay objects and how they are burned into the PDF.
// All coordinates are in "base units": CSS px of the page viewport at scale 1
// (which includes the page's /Rotate), origin top-left as displayed.
import { PDFDocument, PDFPage, LineCapStyle, degrees, rgb, pushGraphicsState, popGraphicsState } from 'pdf-lib';
import { FontFamily, getStdFont, hexToRgb01, sanitizeForFont } from '../pdf';

export type Tool = 'pan' | 'select' | 'pen' | 'highlight' | 'text' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'whiteout' | 'redact' | 'eraser' | 'check' | 'cross';

interface Base {
  id: string;
}
export interface InkAnnot extends Base {
  type: 'ink';
  points: number[];
  color: string;
  width: number;
  opacity: number;
}
export interface ShapeAnnot extends Base {
  type: 'rect' | 'ellipse' | 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  fill: string | null;
  opacity: number;
}
export interface BoxAnnot extends Base {
  type: 'whiteout' | 'redact';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}
export interface TextAnnot extends Base {
  type: 'text';
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  font: FontFamily;
  bold: boolean;
  /** Optional background (used by text edits to cover the original text). */
  bg?: string | null;
  bgBox?: { x: number; y: number; w: number; h: number } | null;
}
export interface ImageAnnot extends Base {
  type: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
}
export interface MarkAnnot extends Base {
  type: 'check' | 'cross';
  x: number;
  y: number;
  size: number;
  color: string;
}

export type Annot = InkAnnot | ShapeAnnot | BoxAnnot | TextAnnot | ImageAnnot | MarkAnnot;

export const LINE_HEIGHT = 1.2;
export const ASCENT = 0.8;

export interface Viewport1 {
  width: number;
  height: number;
  rotation: number;
  convertToPdfPoint(x: number, y: number): number[];
}

let measureCtx: CanvasRenderingContext2D | null = null;
export function measureText(t: TextAnnot): { w: number; h: number } {
  measureCtx ||= document.createElement('canvas').getContext('2d')!;
  const fam = t.font === 'serif' ? 'Times New Roman, serif' : t.font === 'mono' ? 'Courier New, monospace' : 'Helvetica, Arial, sans-serif';
  measureCtx.font = `${t.bold ? 'bold ' : ''}${t.size}px ${fam}`;
  const lines = t.text.split('\n');
  const w = Math.max(4, ...lines.map((l) => measureCtx!.measureText(l).width));
  return { w, h: Math.max(1, lines.length) * t.size * LINE_HEIGHT };
}

export function annotBounds(a: Annot): { x: number; y: number; w: number; h: number } {
  switch (a.type) {
    case 'ink': {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < a.points.length; i += 2) {
        x0 = Math.min(x0, a.points[i]); x1 = Math.max(x1, a.points[i]);
        y0 = Math.min(y0, a.points[i + 1]); y1 = Math.max(y1, a.points[i + 1]);
      }
      const p = a.width / 2;
      return { x: x0 - p, y: y0 - p, w: x1 - x0 + 2 * p, h: y1 - y0 + 2 * p };
    }
    case 'rect': case 'ellipse': case 'line': case 'arrow':
      return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
    case 'text': {
      const m = measureText(a);
      return { x: a.x, y: a.y, w: m.w, h: m.h };
    }
    case 'check': case 'cross':
      return { x: a.x, y: a.y, w: a.size, h: a.size };
    default:
      return { x: a.x, y: a.y, w: a.w, h: a.h };
  }
}

export function moveAnnot(a: Annot, dx: number, dy: number) {
  switch (a.type) {
    case 'ink':
      for (let i = 0; i < a.points.length; i += 2) {
        a.points[i] += dx;
        a.points[i + 1] += dy;
      }
      break;
    case 'rect': case 'ellipse': case 'line': case 'arrow':
      a.x1 += dx; a.x2 += dx; a.y1 += dy; a.y2 += dy;
      break;
    case 'text':
      a.x += dx; a.y += dy;
      if (a.bgBox) { a.bgBox.x += dx; a.bgBox.y += dy; }
      break;
    default:
      a.x += dx; a.y += dy;
  }
}

/** Resize from bottom-right handle. */
export function resizeAnnot(a: Annot, nw: number, nh: number) {
  const b = annotBounds(a);
  const sx = b.w > 0 ? nw / b.w : 1, sy = b.h > 0 ? nh / b.h : 1;
  switch (a.type) {
    case 'image': a.w = Math.max(8, nw); a.h = Math.max(8, nw * (a.h / a.w || 1)); break;
    case 'whiteout': case 'redact': a.w = Math.max(4, nw); a.h = Math.max(4, nh); break;
    case 'check': case 'cross': a.size = Math.max(6, Math.max(nw, nh)); break;
    case 'text': a.size = Math.max(4, Math.min(200, a.size * sy)); break;
    case 'ink':
      for (let i = 0; i < a.points.length; i += 2) {
        a.points[i] = b.x + (a.points[i] - b.x) * sx;
        a.points[i + 1] = b.y + (a.points[i + 1] - b.y) * sy;
      }
      break;
    default: {
      const x0 = Math.min(a.x1, a.x2), y0 = Math.min(a.y1, a.y2);
      a.x1 = x0 + (a.x1 - x0) * sx; a.x2 = x0 + (a.x2 - x0) * sx;
      a.y1 = y0 + (a.y1 - y0) * sy; a.y2 = y0 + (a.y2 - y0) * sy;
    }
  }
}

function col(hex: string) {
  const [r, g, b] = hexToRgb01(hex);
  return rgb(r, g, b);
}

function dataUrlBytes(u: string): Uint8Array {
  const bin = atob(u.slice(u.indexOf(',') + 1));
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

/** Wrap existing page content in q/Q so its graphics state can't leak into what we draw. */
export function isolatePageContent(doc: PDFDocument, page: PDFPage) {
  const flag = '__isolated';
  if ((page as any)[flag]) return;
  const ctx = doc.context;
  const s = ctx.register(ctx.contentStream([pushGraphicsState()]));
  const e = ctx.register(ctx.contentStream([popGraphicsState()]));
  page.node.wrapContentStreams(s, e);
  (page as any)[flag] = true;
}

/** Burn annotations into a pdf-lib page. */
export async function drawAnnots(doc: PDFDocument, page: PDFPage, annots: Annot[], vp: Viewport1) {
  if (!annots.length) return;
  isolatePageContent(doc, page);
  const rot = degrees(vp.rotation);
  const P = (x: number, y: number) => {
    const [px, py] = vp.convertToPdfPoint(x, y);
    return { x: px, y: py };
  };
  for (const a of annots) {
    switch (a.type) {
      case 'ink': {
        if (a.points.length < 2) break;
        let d = '';
        for (let i = 0; i < a.points.length; i += 2) {
          const p = P(a.points[i], a.points[i + 1]);
          d += (i ? ' L ' : 'M ') + p.x.toFixed(2) + ' ' + (-p.y).toFixed(2);
        }
        if (a.points.length === 2) {
          const p = P(a.points[0] + 0.1, a.points[1]);
          d += ' L ' + p.x.toFixed(2) + ' ' + (-p.y).toFixed(2);
        }
        page.drawSvgPath(d, { x: 0, y: 0, borderColor: col(a.color), borderWidth: a.width, borderOpacity: a.opacity, borderLineCap: LineCapStyle.Round });
        break;
      }
      case 'line':
      case 'arrow': {
        const s = P(a.x1, a.y1), e = P(a.x2, a.y2);
        page.drawLine({ start: s, end: e, thickness: a.width, color: col(a.color), opacity: a.opacity, lineCap: LineCapStyle.Round });
        if (a.type === 'arrow') {
          const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
          const L = Math.max(8, a.width * 4);
          for (const s2 of [-1, 1]) {
            const hx = a.x2 - L * Math.cos(ang + s2 * 0.5), hy = a.y2 - L * Math.sin(ang + s2 * 0.5);
            page.drawLine({ start: e, end: P(hx, hy), thickness: a.width, color: col(a.color), opacity: a.opacity, lineCap: LineCapStyle.Round });
          }
        }
        break;
      }
      case 'rect':
      case 'ellipse': {
        const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2), w = Math.abs(a.x2 - a.x1), hh = Math.abs(a.y2 - a.y1);
        if (a.type === 'rect') {
          const o = P(x, y + hh);
          page.drawRectangle({
            x: o.x, y: o.y, width: w, height: hh, rotate: rot,
            borderColor: col(a.color), borderWidth: a.width, borderOpacity: a.opacity,
            color: a.fill ? col(a.fill) : undefined, opacity: a.fill ? a.opacity : undefined,
          });
        } else {
          const c = P(x + w / 2, y + hh / 2);
          page.drawEllipse({
            x: c.x, y: c.y, xScale: w / 2, yScale: hh / 2, rotate: rot,
            borderColor: col(a.color), borderWidth: a.width, borderOpacity: a.opacity,
            color: a.fill ? col(a.fill) : undefined, opacity: a.fill ? a.opacity : undefined,
          });
        }
        break;
      }
      case 'whiteout':
      case 'redact': {
        const o = P(a.x, a.y + a.h);
        page.drawRectangle({ x: o.x, y: o.y, width: a.w, height: a.h, rotate: rot, color: col(a.type === 'redact' ? '#000000' : a.color) });
        break;
      }
      case 'check':
      case 'cross': {
        const s = a.size;
        const pts = a.type === 'check'
          ? [[0.1, 0.55], [0.4, 0.85], [0.92, 0.15]]
          : [[0.15, 0.15], [0.85, 0.85], null, [0.85, 0.15], [0.15, 0.85]];
        let d = '';
        let first = true;
        for (const p of pts) {
          if (!p) { first = true; continue; }
          const q = P(a.x + p[0] * s, a.y + p[1] * s);
          d += (first ? ' M ' : ' L ') + q.x.toFixed(2) + ' ' + (-q.y).toFixed(2);
          first = false;
        }
        page.drawSvgPath(d.trim(), { x: 0, y: 0, borderColor: col(a.color), borderWidth: Math.max(1, s * 0.12), borderLineCap: LineCapStyle.Round });
        break;
      }
      case 'text': {
        if (a.bg && a.bgBox) {
          const o = P(a.bgBox.x, a.bgBox.y + a.bgBox.h);
          page.drawRectangle({ x: o.x, y: o.y, width: a.bgBox.w, height: a.bgBox.h, rotate: rot, color: col(a.bg) });
        }
        const font = await getStdFont(doc, a.font, a.bold);
        const lines = a.text.split('\n');
        lines.forEach((ln, i) => {
          const t = sanitizeForFont(font, ln);
          if (!t) return;
          const o = P(a.x, a.y + a.size * ASCENT + i * a.size * LINE_HEIGHT);
          page.drawText(t, { x: o.x, y: o.y, size: a.size, font, color: col(a.color), rotate: rot });
        });
        break;
      }
      case 'image': {
        const bytes = dataUrlBytes(a.src);
        const img = a.src.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const o = P(a.x, a.y + a.h);
        page.drawImage(img, { x: o.x, y: o.y, width: a.w, height: a.h, rotate: rot });
        break;
      }
    }
  }
}
