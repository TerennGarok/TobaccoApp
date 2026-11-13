// The PDF editor screen: viewing, markup, text editing, forms, signing, OCR, search & export.
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import {
  h, icon, iconBtn, toast, busy, nextFrame, choose, confirmDlg, promptDlg, pickFiles, sheet, clear, uid,
  shareOrDownload, downloadBlob, safeFilename, formatBytes,
} from '../ui';
import { Screen, push, pop } from '../nav';
import { DocMeta, saveDoc } from '../store';
import {
  openPdfJsInteractive, loadPdfLib, renderPageToCanvas, makeThumb, PDFDocumentProxy, PDFPageProxy, cssFontFor, FontFamily,
  canvasToBytes, getStdFont, sanitizeForFont, hexToRgb01, canvasToBlob,
} from '../pdf';
import { Annot, Tool, TextAnnot, drawAnnots, annotBounds, moveAnnot, resizeAnnot, measureText, LINE_HEIGHT, ASCENT, Viewport1, isolatePageContent } from './model';
import { readForm, writeForm, FormWidget, FieldValue, hasXfa } from './forms';
import { getTextLines, getPageText, TextLine } from './text';
import { getSignature } from './signature';
import { openOrganizer } from './pages';
import { OCR_LANGS, getOcrLang, setOcrLang, recognizeCanvas, addTextLayer } from '../ocr';

interface PageView {
  index: number;
  page: PDFPageProxy;
  vp1: Viewport1 & { convertToViewportRectangle(r: number[]): number[] };
  bw: number;
  bh: number;
  box: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ov: HTMLDivElement;
  svg: SVGSVGElement;
  textLayer: HTMLDivElement;
  hlLayer: HTMLDivElement;
  formLayer: HTMLDivElement;
  renderedScale: number;
  rendering: boolean;
  lines?: TextLine[];
}

type Mode = 'view' | 'markup' | 'text' | 'form';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag: string, attrs: Record<string, any> = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, String(v));
  return e;
};

const PALETTE = ['#111827', '#1d4ed8', '#dc2626', '#16a34a', '#facc15', '#f97316', '#9333ea', '#ec4899', '#ffffff'];

export interface EditorDeps {
  onSaved(meta: DocMeta): void;
  startScan(mode: 'camera' | 'photos', onBytes: (bytes: Uint8Array) => Promise<void>): void;
}

export async function openEditor(meta: DocMeta, initialBytes: Uint8Array, deps: EditorDeps): Promise<void> {
  let bytes = initialBytes;
  let password: string | undefined;
  let pdf: PDFDocumentProxy;
  try {
    const r = await openPdfJsInteractive(bytes, (retry) => promptDlg(retry ? 'Wrong password — try again' : 'This PDF is password protected', '', { placeholder: 'Password', okLabel: 'Open' }));
    pdf = r.doc;
    password = r.password;
  } catch (e: any) {
    toast('Could not open PDF: ' + (e?.message || e));
    return;
  }

  // ---------------- state ----------------
  let views: PageView[] = [];
  let zoom = 1;
  let mode: Mode = 'view';
  let tool: Tool = 'pan';
  const annots = new Map<number, Annot[]>();
  let formWidgets: FormWidget[] = [];
  let formValues = new Map<string, FieldValue>();
  let formDirty = false;
  let dirty = false;
  let selected: { page: number; id: string } | null = null;
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  const style = {
    pen: { color: '#1d4ed8', width: 2.5 },
    highlight: { color: '#facc15', width: 14 },
    shape: { color: '#dc2626', width: 2 },
    text: { color: '#111827', size: 14, font: 'sans' as FontFamily, bold: false },
    mark: { color: '#111827', size: 14 },
  };
  let encrypted = false;

  // ---------------- DOM ----------------
  const titleEl = h('button', { class: 'top-title clickable', onclick: () => rename() }, meta.name);
  const saveBtn = h('button', { class: 'btn primary small save-btn', onclick: () => save() }, icon('save', 16), 'Save');
  const searchBar = h('div', { class: 'search-bar hidden' });
  const top = h('div', { class: 'top-bar' },
    iconBtn('back', 'Back', () => pop()),
    titleEl,
    iconBtn('search', 'Search', () => toggleSearch()),
    saveBtn,
    iconBtn('more', 'More', () => moreMenu()),
  );
  const pagesWrap = h('div', { class: 'pages' });
  const scroller = h('div', { class: 'scroller' }, pagesWrap);
  const pageInd = h('div', { class: 'page-ind' }, '');
  const zoomCtl = h('div', { class: 'zoom-ctl' },
    iconBtn('zoomout', 'Zoom out', () => setZoom(zoom / 1.25)),
    iconBtn('zoomin', 'Zoom in', () => setZoom(zoom * 1.25)),
  );
  const subBar = h('div', { class: 'sub-bar' });
  const modeBar = h('div', { class: 'mode-bar' });
  const formBanner = h('div', { class: 'banner hidden' });
  const el = h('div', { class: 'editor' }, top, searchBar, formBanner, h('div', { class: 'viewer' }, scroller, pageInd, zoomCtl), subBar, modeBar);

  const screen: Screen = {
    el,
    destroy: () => {
      io?.disconnect();
      ro.disconnect();
      pdf.destroy();
    },
    canLeave: async () => {
      if (!dirty) return true;
      const c = await choose('Unsaved changes', [
        { label: 'Save changes', value: 'save', icon: 'save' },
        { label: 'Discard changes', value: 'discard', icon: 'trash', danger: true },
      ]);
      if (c === 'save') return await save();
      return c === 'discard';
    },
  };
  push(screen);

  // ---------------- mode bar ----------------
  const modeDefs: { id: Mode | 'pages' | 'ocr' | 'sign'; label: string; icon: string }[] = [
    { id: 'view', label: 'View', icon: 'hand' },
    { id: 'markup', label: 'Markup', icon: 'pen' },
    { id: 'text', label: 'Edit text', icon: 'type' },
    { id: 'form', label: 'Fill & Sign', icon: 'form' },
    { id: 'pages', label: 'Pages', icon: 'grid' },
    { id: 'ocr', label: 'OCR', icon: 'ocr' },
  ];
  function renderModeBar() {
    clear(modeBar);
    for (const m of modeDefs) {
      modeBar.appendChild(
        h('button', { class: 'mode-btn' + (m.id === mode ? ' on' : ''), onclick: () => onMode(m.id) }, icon(m.icon), h('span', null, m.label)),
      );
    }
  }
  function onMode(id: string) {
    if (id === 'pages') return organizer();
    if (id === 'ocr') return ocrMenu();
    setMode(id as Mode);
  }
  function setMode(m: Mode) {
    mode = m;
    select(null);
    if (m === 'view') tool = 'pan';
    else if (m === 'markup') tool = tool === 'pan' || tool === 'text' ? 'pen' : tool;
    else if (m === 'text') tool = 'pan';
    else if (m === 'form') tool = 'pan';
    renderModeBar();
    renderSubBar();
    applyToolClass();
    views.forEach((v) => renderTextLayer(v));
  }

  // ---------------- sub bar ----------------
  function toolButton(t: Tool, ic: string, label: string) {
    return h('button', { class: 'tool-btn' + (tool === t ? ' on' : ''), onclick: () => { tool = tool === t && mode !== 'markup' ? 'pan' : t; select(null); renderSubBar(); applyToolClass(); } }, icon(ic), h('span', null, label));
  }
  function currentStyle() {
    if (tool === 'pen') return style.pen;
    if (tool === 'highlight') return style.highlight;
    if (tool === 'text') return style.text;
    if (tool === 'check' || tool === 'cross') return style.mark;
    return style.shape;
  }
  function colorButton() {
    const st = currentStyle();
    return h('button', { class: 'tool-btn', onclick: () => pickColor() }, h('span', { class: 'color-dot', style: { background: st.color } }), h('span', null, 'Color'));
  }
  function widthButton() {
    const st: any = currentStyle();
    const label = 'size' in st ? `${Math.round(st.size)}pt` : `${st.width}px`;
    return h('button', { class: 'tool-btn', onclick: () => pickWidth() }, h('span', { class: 'width-label' }, label), h('span', null, 'Size'));
  }
  function renderSubBar() {
    clear(subBar);
    subBar.className = 'sub-bar';
    if (mode === 'view') {
      subBar.classList.add('hidden');
      return;
    }
    const row = h('div', { class: 'tool-row' });
    if (mode === 'markup') {
      row.append(
        toolButton('select', 'pointer', 'Select'),
        toolButton('pan', 'hand', 'Scroll'),
        toolButton('pen', 'pen', 'Pen'),
        toolButton('highlight', 'highlighter', 'Highlight'),
        toolButton('text', 'text', 'Text'),
        toolButton('rect', 'square', 'Box'),
        toolButton('ellipse', 'circle', 'Oval'),
        toolButton('line', 'line', 'Line'),
        toolButton('arrow', 'arrow', 'Arrow'),
        toolButton('whiteout', 'whiteout', 'Whiteout'),
        toolButton('redact', 'square', 'Redact'),
        toolButton('eraser', 'eraser', 'Eraser'),
        h('button', { class: 'tool-btn', onclick: () => addSignature() }, icon('sign'), h('span', null, 'Sign')),
        h('button', { class: 'tool-btn', onclick: () => addImage() }, icon('image'), h('span', null, 'Image')),
        h('button', { class: 'tool-btn', onclick: () => addStamp() }, icon('stamp'), h('span', null, 'Stamp')),
        h('span', { class: 'divider' }),
        colorButton(),
        widthButton(),
      );
    } else if (mode === 'text') {
      row.append(
        h('div', { class: 'hint-chip' }, 'Tap any text to edit it'),
        toolButton('text', 'text', 'Add text'),
        toolButton('select', 'pointer', 'Move'),
      );
      if (tool === 'text') row.append(colorButton(), widthButton());
    } else if (mode === 'form') {
      if (formWidgets.length) row.append(h('button', { class: 'tool-btn', onclick: () => nextField() }, icon('right'), h('span', null, 'Next field')));
      else row.append(h('div', { class: 'hint-chip' }, 'No form fields — tap a tool, then the page'));
      row.append(
        toolButton('text', 'text', 'Text'),
        toolButton('check', 'check', 'Check'),
        toolButton('cross', 'x', 'Cross'),
        h('button', { class: 'tool-btn', onclick: () => addDate() }, icon('edit'), h('span', null, 'Date')),
        h('button', { class: 'tool-btn', onclick: () => addSignature() }, icon('sign'), h('span', null, 'Sign')),
        h('button', { class: 'tool-btn', onclick: () => addInitials() }, icon('pen'), h('span', null, 'Initials')),
        toolButton('select', 'pointer', 'Move'),
        h('span', { class: 'divider' }),
        colorButton(),
      );
    }
    row.append(
      h('span', { class: 'divider' }),
      h('button', { class: 'tool-btn', disabled: !undoStack.length, onclick: () => undo() }, icon('undo'), h('span', null, 'Undo')),
      h('button', { class: 'tool-btn', disabled: !redoStack.length, onclick: () => redo() }, icon('redo'), h('span', null, 'Redo')),
    );
    subBar.appendChild(row);
    // keep the active tool visible
    requestAnimationFrame(() => row.querySelector('.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }));
  }

  async function pickColor() {
    const st = currentStyle();
    const s = sheet('Color', [
      h('div', { class: 'swatches big' }, PALETTE.map((c) =>
        h('button', { class: 'swatch' + (c === st.color ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: () => { st.color = c; s.close(); renderSubBar(); applyStyleToSelected(); } }),
      )),
      h('label', { class: 'form-row' }, h('span', null, 'Custom'), (() => {
        const inp = h('input', { type: 'color', value: st.color }) as HTMLInputElement;
        inp.value = st.color;
        inp.addEventListener('change', () => { st.color = inp.value; s.close(); renderSubBar(); applyStyleToSelected(); });
        return inp;
      })()),
    ]);
  }
  async function pickWidth() {
    const st: any = currentStyle();
    if ('size' in st) {
      const sizes = [8, 10, 12, 14, 18, 24, 32, 48];
      const v = await choose('Text size', sizes.map((n) => ({ label: `${n} pt`, value: n })));
      if (v) { st.size = v; applyStyleToSelected(); }
    } else {
      const ws = tool === 'highlight' ? [8, 12, 16, 24] : [1, 2, 3, 5, 8, 12];
      const v = await choose('Line width', ws.map((n) => ({ label: `${n}`, value: n })));
      if (v) { st.width = v; applyStyleToSelected(); }
    }
    renderSubBar();
  }
  function applyStyleToSelected() {
    const a = getSelected();
    if (!a) return;
    snapshot();
    const st: any = currentStyle();
    if ('color' in a) (a as any).color = st.color;
    if (a.type === 'text' && st.size) a.size = st.size;
    if ((a.type === 'ink' || a.type === 'rect' || a.type === 'ellipse' || a.type === 'line' || a.type === 'arrow') && st.width) a.width = st.width;
    markDirty();
    renderAnnots(selected!.page);
  }

  function applyToolClass() {
    const drawing = tool !== 'pan';
    scroller.classList.toggle('drawing', drawing);
    scroller.dataset.tool = tool;
    scroller.dataset.mode = mode;
  }

  // ---------------- layout & rendering ----------------
  let maxBaseW = 1;
  let io: IntersectionObserver | null = null;
  const visible = new Set<number>();

  async function buildPages() {
    io?.disconnect();
    clear(pagesWrap);
    views = [];
    visible.clear();
    maxBaseW = 1;
    for (let i = 0; i < pdf.numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const vp1 = page.getViewport({ scale: 1 }) as any;
      const bw = vp1.width, bh = vp1.height;
      maxBaseW = Math.max(maxBaseW, bw);
      const canvas = h('canvas', { class: 'page-canvas' });
      const svg = S('svg', { class: 'anno-layer', viewBox: `0 0 ${bw} ${bh}`, width: bw, height: bh }) as SVGSVGElement;
      const textLayer = h('div', { class: 'text-layer' });
      const hlLayer = h('div', { class: 'hl-layer' });
      const formLayer = h('div', { class: 'form-layer' });
      const ov = h('div', { class: 'ov', style: { width: bw + 'px', height: bh + 'px' } }, hlLayer, textLayer, formLayer);
      ov.insertBefore(svg, textLayer);
      const box = h('div', { class: 'page-box', dataset: { index: String(i) } }, canvas, ov, h('div', { class: 'page-num' }, String(i + 1)));
      const v: PageView = { index: i, page, vp1, bw, bh, box, canvas, ov, svg, textLayer, hlLayer, formLayer, renderedScale: 0, rendering: false };
      views.push(v);
      pagesWrap.appendChild(box);
      attachPointer(v);
    }
    layout();
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const i = Number((e.target as HTMLElement).dataset.index);
        if (e.isIntersecting) visible.add(i);
        else visible.delete(i);
      }
      scheduleRender();
      updatePageInd();
    }, { root: scroller, rootMargin: '150% 0px' });
    views.forEach((v) => io!.observe(v.box));
    views.forEach((v) => {
      renderAnnots(v.index);
      renderForm(v);
    });
  }

  function cssScale() {
    const avail = Math.max(200, scroller.clientWidth - 16);
    return (avail / maxBaseW) * zoom;
  }

  function layout() {
    const s = cssScale();
    for (const v of views) {
      v.box.style.width = v.bw * s + 'px';
      v.box.style.height = v.bh * s + 'px';
      v.ov.style.transform = `scale(${s})`;
    }
    scheduleRender();
  }

  let renderTimer: any = 0;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderVisible, 60);
  }

  async function renderVisible() {
    const s = cssScale();
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    for (const v of views) {
      if (!visible.has(v.index)) {
        if (v.renderedScale) {
          // free memory for far-away pages
          v.canvas.width = v.canvas.height = 1;
          v.renderedScale = 0;
        }
        continue;
      }
      let target = s * dpr;
      const maxPx = 6_000_000;
      if (v.bw * v.bh * target * target > maxPx) target = Math.sqrt(maxPx / (v.bw * v.bh));
      if (v.rendering || Math.abs(v.renderedScale - target) < 0.01) continue;
      v.rendering = true;
      try {
        const tmp = await renderPageToCanvas(v.page, target, undefined, formWidgets.some((w) => w.pageIndex === v.index));
        v.canvas.width = tmp.width;
        v.canvas.height = tmp.height;
        v.canvas.getContext('2d')!.drawImage(tmp, 0, 0);
        v.renderedScale = target;
      } catch (e) {
        console.warn('render failed', e);
      } finally {
        v.rendering = false;
      }
    }
  }

  function updatePageInd() {
    const r = scroller.getBoundingClientRect();
    let cur = 0;
    for (const v of views) {
      const b = v.box.getBoundingClientRect();
      if (b.top < r.top + r.height / 2) cur = v.index;
    }
    pageInd.textContent = `${cur + 1} / ${views.length}`;
    pageInd.classList.add('show');
    clearTimeout((pageInd as any)._t);
    (pageInd as any)._t = setTimeout(() => pageInd.classList.remove('show'), 1500);
  }
  scroller.addEventListener('scroll', () => updatePageInd(), { passive: true });

  function currentPageIndex() {
    const r = scroller.getBoundingClientRect();
    let best = 0, bestVis = -1;
    for (const v of views) {
      const b = v.box.getBoundingClientRect();
      const vis = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
      if (vis > bestVis) { bestVis = vis; best = v.index; }
    }
    return best;
  }

  function setZoom(z: number) {
    const nz = Math.max(0.5, Math.min(5, z));
    const ratio = nz / zoom;
    const cx = scroller.scrollLeft + scroller.clientWidth / 2, cy = scroller.scrollTop + scroller.clientHeight / 2;
    zoom = nz;
    layout();
    scroller.scrollLeft = cx * ratio - scroller.clientWidth / 2;
    scroller.scrollTop = cy * ratio - scroller.clientHeight / 2;
  }

  // pinch-to-zoom (in pan mode)
  {
    let startDist = 0, startZoom = 1;
    scroller.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        startDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        startZoom = zoom;
      }
    }, { passive: true });
    scroller.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && startDist) {
        e.preventDefault();
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const r = d / startDist;
        pagesWrap.style.transformOrigin = 'center top';
        pagesWrap.style.transform = `scale(${(startZoom * r) / zoom})`;
      }
    }, { passive: false });
    scroller.addEventListener('touchend', (e) => {
      if (startDist && e.touches.length < 2) {
        const m = /scale\(([\d.]+)\)/.exec(pagesWrap.style.transform);
        pagesWrap.style.transform = '';
        startDist = 0;
        if (m) setZoom(zoom * parseFloat(m[1]));
      }
    });
    scroller.addEventListener('dblclick', (e) => {
      if (tool !== 'pan' || (e.target as HTMLElement).closest('input,textarea,select')) return;
      setZoom(zoom > 1.2 ? 1 : 2);
    });
  }

  const ro = new ResizeObserver(() => layout());
  ro.observe(scroller);

  // ---------------- annotations ----------------
  function list(i: number) {
    if (!annots.has(i)) annots.set(i, []);
    return annots.get(i)!;
  }
  function snapshot() {
    undoStack.push(serialize());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }
  function serialize() {
    return JSON.stringify({ a: Array.from(annots.entries()), f: Array.from(formValues.entries()), fd: formDirty });
  }
  function restore(s: string) {
    const o = JSON.parse(s);
    annots.clear();
    for (const [k, v] of o.a) annots.set(k, v);
    formValues = new Map(o.f);
    formDirty = o.fd;
    select(null);
    views.forEach((v) => { renderAnnots(v.index); renderForm(v); renderTextLayer(v); });
    markDirty();
  }
  function undo() {
    const s = undoStack.pop();
    if (!s) return;
    redoStack.push(serialize());
    restore(s);
  }
  function redo() {
    const s = redoStack.pop();
    if (!s) return;
    undoStack.push(serialize());
    restore(s);
  }
  function markDirty() {
    dirty = [...annots.values()].some((l) => l.length) || formDirty;
    saveBtn.classList.toggle('attention', dirty);
    renderSubBar();
  }
  function getSelected(): Annot | null {
    if (!selected) return null;
    return list(selected.page).find((a) => a.id === selected!.id) || null;
  }
  function select(sel: { page: number; id: string } | null) {
    const prev = selected;
    selected = sel;
    if (prev) renderAnnots(prev.page);
    if (sel && (!prev || prev.page !== sel.page)) renderAnnots(sel.page);
  }

  function annotNode(a: Annot): SVGElement {
    switch (a.type) {
      case 'ink': {
        const pts: string[] = [];
        for (let i = 0; i < a.points.length; i += 2) pts.push(a.points[i].toFixed(1) + ',' + a.points[i + 1].toFixed(1));
        if (a.points.length === 2) pts.push((a.points[0] + 0.1).toFixed(1) + ',' + a.points[1].toFixed(1));
        return S('polyline', { points: pts.join(' '), fill: 'none', stroke: a.color, 'stroke-width': a.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: a.opacity, style: a.opacity < 1 ? 'mix-blend-mode:multiply' : undefined });
      }
      case 'rect': {
        return S('rect', { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), width: Math.abs(a.x2 - a.x1), height: Math.abs(a.y2 - a.y1), fill: a.fill || 'none', stroke: a.color, 'stroke-width': a.width, opacity: a.opacity });
      }
      case 'ellipse': {
        return S('ellipse', { cx: (a.x1 + a.x2) / 2, cy: (a.y1 + a.y2) / 2, rx: Math.abs(a.x2 - a.x1) / 2, ry: Math.abs(a.y2 - a.y1) / 2, fill: a.fill || 'none', stroke: a.color, 'stroke-width': a.width, opacity: a.opacity });
      }
      case 'line':
      case 'arrow': {
        const g = S('g', { stroke: a.color, 'stroke-width': a.width, 'stroke-linecap': 'round', opacity: a.opacity });
        g.appendChild(S('line', { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 }));
        if (a.type === 'arrow') {
          const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
          const L = Math.max(8, a.width * 4);
          for (const s2 of [-1, 1]) g.appendChild(S('line', { x1: a.x2, y1: a.y2, x2: a.x2 - L * Math.cos(ang + s2 * 0.5), y2: a.y2 - L * Math.sin(ang + s2 * 0.5) }));
        }
        return g;
      }
      case 'whiteout':
      case 'redact':
        return S('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: a.type === 'redact' ? '#000' : a.color, stroke: a.type === 'whiteout' ? 'rgba(0,0,0,.12)' : 'none', 'stroke-width': 0.5, 'stroke-dasharray': '2 2' });
      case 'check':
      case 'cross': {
        const s = a.size;
        const d = a.type === 'check'
          ? `M${a.x + 0.1 * s} ${a.y + 0.55 * s} L${a.x + 0.4 * s} ${a.y + 0.85 * s} L${a.x + 0.92 * s} ${a.y + 0.15 * s}`
          : `M${a.x + 0.15 * s} ${a.y + 0.15 * s} L${a.x + 0.85 * s} ${a.y + 0.85 * s} M${a.x + 0.85 * s} ${a.y + 0.15 * s} L${a.x + 0.15 * s} ${a.y + 0.85 * s}`;
        return S('path', { d, fill: 'none', stroke: a.color, 'stroke-width': Math.max(1, s * 0.12), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      }
      case 'text': {
        const g = S('g');
        if (a.bg && a.bgBox) g.appendChild(S('rect', { x: a.bgBox.x, y: a.bgBox.y, width: a.bgBox.w, height: a.bgBox.h, fill: a.bg }));
        const t = S('text', { x: a.x, y: a.y, fill: a.color, 'font-size': a.size, 'font-family': cssFontFor(a.font), 'font-weight': a.bold ? 'bold' : 'normal' });
        t.setAttribute('xml:space', 'preserve');
        a.text.split('\n').forEach((ln, i) => {
          const sp = S('tspan', { x: a.x, y: a.y + a.size * ASCENT + i * a.size * LINE_HEIGHT });
          sp.textContent = ln || ' ';
          t.appendChild(sp);
        });
        g.appendChild(t);
        return g;
      }
      case 'image':
        return S('image', { href: a.src, x: a.x, y: a.y, width: a.w, height: a.h, preserveAspectRatio: 'none' });
    }
  }

  function renderAnnots(i: number) {
    const v = views[i];
    if (!v) return;
    while (v.svg.firstChild) v.svg.removeChild(v.svg.firstChild);
    for (const a of list(i)) v.svg.appendChild(annotNode(a));
    v.ov.querySelector('.sel-tools')?.remove();
    if (selected && selected.page === i) {
      const a = getSelected();
      if (a) {
        const b = annotBounds(a);
        const s = cssScale();
        const pad = 4;
        v.svg.appendChild(S('rect', { class: 'sel-box', x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2, 'stroke-width': 1.5 / s }));
        v.svg.appendChild(S('circle', { class: 'sel-handle', cx: b.x + b.w + pad, cy: b.y + b.h + pad, r: 9 / s, 'stroke-width': 2 / s }));
        const tools = h('div', { class: 'sel-tools', style: { left: b.x + 'px', top: Math.max(0, b.y - pad - 46 / s) + 'px', transform: `scale(${1 / s})` } },
          a.type === 'text' ? h('button', { onclick: (e: Event) => { e.stopPropagation(); editTextAnnot(i, a); } }, 'Edit') : null,
          h('button', { onclick: (e: Event) => { e.stopPropagation(); duplicateSelected(); } }, 'Copy'),
          h('button', { class: 'danger', onclick: (e: Event) => { e.stopPropagation(); deleteSelected(); } }, 'Delete'),
        );
        tools.addEventListener('pointerdown', (e) => e.stopPropagation());
        v.ov.appendChild(tools);
      }
    }
  }

  function deleteSelected() {
    if (!selected) return;
    snapshot();
    const l = list(selected.page);
    const idx = l.findIndex((a) => a.id === selected!.id);
    if (idx >= 0) l.splice(idx, 1);
    const p = selected.page;
    selected = null;
    renderAnnots(p);
    views[p] && renderTextLayer(views[p]);
    markDirty();
  }
  function duplicateSelected() {
    const a = getSelected();
    if (!a || !selected) return;
    snapshot();
    const c = JSON.parse(JSON.stringify(a));
    c.id = uid();
    moveAnnot(c, 12, 12);
    list(selected.page).push(c);
    select({ page: selected.page, id: c.id });
    markDirty();
  }

  function addAnnot(page: number, a: Annot, selectIt = false) {
    snapshot();
    list(page).push(a);
    if (selectIt) {
      selected = { page, id: a.id };
    }
    renderAnnots(page);
    markDirty();
  }

  function hitTest(i: number, x: number, y: number, tol: number): Annot | null {
    const l = list(i);
    for (let k = l.length - 1; k >= 0; k--) {
      const a = l[k];
      if (a.type === 'ink') {
        for (let j = 0; j < a.points.length; j += 2) if (Math.hypot(a.points[j] - x, a.points[j + 1] - y) < tol + a.width / 2) return a;
        continue;
      }
      const b = annotBounds(a);
      if (x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol) return a;
    }
    return null;
  }

  function attachPointer(v: PageView) {
    let active: { kind: string; a?: Annot; start: { x: number; y: number }; last: { x: number; y: number }; orig?: any; pid: number; node?: SVGElement } | null = null;
    const toBase = (e: PointerEvent) => {
      const r = v.ov.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * v.bw, y: ((e.clientY - r.top) / r.height) * v.bh };
    };
    v.ov.addEventListener('pointerdown', (e) => {
      if (tool === 'pan') return;
      if ((e.target as HTMLElement).closest('.form-field, .sel-tools, .tl-line')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const p = toBase(e);
      const s = cssScale();
      const tol = 10 / s;
      e.preventDefault();
      v.ov.setPointerCapture(e.pointerId);
      const pid = e.pointerId;
      if (tool === 'select') {
        // resize handle?
        const cur = selected?.page === v.index ? getSelected() : null;
        if (cur) {
          const b = annotBounds(cur);
          if (Math.hypot(p.x - (b.x + b.w + 4), p.y - (b.y + b.h + 4)) < 18 / s) {
            snapshot();
            active = { kind: 'resize', a: cur, start: p, last: p, orig: { ...b }, pid };
            return;
          }
        }
        const hit = hitTest(v.index, p.x, p.y, tol);
        if (hit) {
          select({ page: v.index, id: hit.id });
          snapshot();
          active = { kind: 'move', a: hit, start: p, last: p, pid };
        } else select(null);
        return;
      }
      if (tool === 'eraser') {
        active = { kind: 'erase', start: p, last: p, pid };
        eraseAt(v.index, p, tol, true);
        return;
      }
      if (tool === 'text') {
        placeText(v.index, p);
        return;
      }
      if (tool === 'check' || tool === 'cross') {
        const sz = style.mark.size;
        addAnnot(v.index, { id: uid(), type: tool, x: p.x - sz / 2, y: p.y - sz / 2, size: sz, color: style.mark.color });
        return;
      }
      if (tool === 'pen' || tool === 'highlight') {
        const st = tool === 'pen' ? style.pen : style.highlight;
        const a: Annot = { id: uid(), type: 'ink', points: [p.x, p.y], color: st.color, width: st.width, opacity: tool === 'highlight' ? 0.4 : 1 };
        const node = annotNode(a);
        v.svg.appendChild(node);
        active = { kind: 'ink', a, start: p, last: p, pid, node };
        return;
      }
      // shapes & boxes
      const st = style.shape;
      let a: Annot;
      if (tool === 'whiteout' || tool === 'redact') a = { id: uid(), type: tool, x: p.x, y: p.y, w: 0, h: 0, color: '#ffffff' };
      else a = { id: uid(), type: tool as any, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: st.color, width: st.width, fill: null, opacity: 1 };
      const node = annotNode(a);
      v.svg.appendChild(node);
      active = { kind: 'shape', a, start: p, last: p, pid, node };
    });
    v.ov.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== active.pid) return;
      const p = toBase(e);
      const a = active.a!;
      if (active.kind === 'ink' && a.type === 'ink') {
        const lx = a.points[a.points.length - 2], ly = a.points[a.points.length - 1];
        if (Math.hypot(p.x - lx, p.y - ly) < 0.8 / cssScale()) return;
        a.points.push(p.x, p.y);
        const n = annotNode(a);
        active.node!.replaceWith(n);
        active.node = n;
      } else if (active.kind === 'shape') {
        if (a.type === 'whiteout' || a.type === 'redact') {
          a.x = Math.min(active.start.x, p.x); a.y = Math.min(active.start.y, p.y);
          a.w = Math.abs(p.x - active.start.x); a.h = Math.abs(p.y - active.start.y);
        } else if ('x2' in a) {
          a.x2 = p.x; a.y2 = p.y;
        }
        const n = annotNode(a);
        active.node!.replaceWith(n);
        active.node = n;
      } else if (active.kind === 'move') {
        moveAnnot(a, p.x - active.last.x, p.y - active.last.y);
        active.last = p;
        renderAnnots(v.index);
      } else if (active.kind === 'resize') {
        const o = active.orig;
        resizeAnnot(a, Math.max(4, o.w + (p.x - active.start.x)), Math.max(4, o.h + (p.y - active.start.y)));
        active.orig = { ...annotBounds(a) };
        active.start = p;
        renderAnnots(v.index);
      } else if (active.kind === 'erase') {
        eraseAt(v.index, p, 10 / cssScale(), false);
      }
    });
    const end = (e: PointerEvent) => {
      if (!active || e.pointerId !== active.pid) return;
      const a = active.a;
      if (active.kind === 'ink' && a) {
        active.node?.remove();
        addAnnot(v.index, a);
      } else if (active.kind === 'shape' && a) {
        active.node?.remove();
        const b = annotBounds(a);
        if (Math.max(b.w, b.h) > 3) addAnnot(v.index, a);
      } else if (active.kind === 'move' || active.kind === 'resize') {
        const moved = Math.hypot(active.last.x - active.start.x, active.last.y - active.start.y) > 0 || active.kind === 'resize';
        if (!moved) undoStack.pop();
        markDirty();
        if (a?.type === 'text' && !moved && active.kind === 'move' && performance.now() - lastTap < 350) editTextAnnot(v.index, a as TextAnnot);
        lastTap = performance.now();
      }
      active = null;
    };
    v.ov.addEventListener('pointerup', end);
    v.ov.addEventListener('pointercancel', end);
  }
  let lastTap = 0;
  let eraseSnap = false;
  function eraseAt(i: number, p: { x: number; y: number }, tol: number, first: boolean) {
    if (first) eraseSnap = false;
    const hit = hitTest(i, p.x, p.y, tol);
    if (!hit) return;
    if (!eraseSnap) { snapshot(); eraseSnap = true; }
    const l = list(i);
    l.splice(l.indexOf(hit), 1);
    renderAnnots(i);
    markDirty();
  }

  // ---------------- text placement / editing ----------------
  function textSheet(title: string, init: { text: string; size: number; color: string; font: FontFamily; bold: boolean }, extra?: { onDelete?: () => void }): Promise<typeof init | null> {
    return new Promise((resolve) => {
      let done = false;
      const ta = h('textarea', { class: 'field', rows: 3 }) as HTMLTextAreaElement;
      ta.value = init.text;
      const size = h('input', { class: 'field', type: 'number', min: 4, max: 200, step: 0.5 }) as HTMLInputElement;
      size.value = String(Math.round(init.size * 10) / 10);
      const font = h('select', { class: 'field' }, h('option', { value: 'sans' }, 'Sans (Helvetica)'), h('option', { value: 'serif' }, 'Serif (Times)'), h('option', { value: 'mono' }, 'Mono (Courier)')) as HTMLSelectElement;
      font.value = init.font;
      const bold = h('input', { type: 'checkbox' }) as HTMLInputElement;
      bold.checked = init.bold;
      const color = h('input', { type: 'color' }) as HTMLInputElement;
      color.value = init.color;
      const s = sheet(title, [
        ta,
        h('div', { class: 'grid2' },
          h('label', { class: 'form-row' }, h('span', null, 'Size'), size),
          h('label', { class: 'form-row' }, h('span', null, 'Color'), color),
        ),
        h('label', { class: 'form-row' }, h('span', null, 'Font'), font),
        h('label', { class: 'check-row' }, bold, h('span', null, 'Bold')),
        h('div', { class: 'btn-row' },
          extra?.onDelete ? h('button', { class: 'btn danger', onclick: () => { done = true; s.close(); extra.onDelete!(); resolve(null); } }, 'Delete') : h('button', { class: 'btn', onclick: () => s.close() }, 'Cancel'),
          h('button', { class: 'btn primary', onclick: () => {
            done = true;
            s.close();
            resolve({ text: ta.value, size: Math.max(4, Number(size.value) || init.size), color: color.value, font: font.value as FontFamily, bold: bold.checked });
          } }, 'Apply'),
        ),
      ], { onClose: () => !done && resolve(null) });
      setTimeout(() => ta.focus(), 200);
    });
  }

  async function placeText(page: number, p: { x: number; y: number }, preset?: string) {
    const st = style.text;
    const r = preset !== undefined ? { text: preset, size: st.size, color: st.color, font: st.font, bold: st.bold } : await textSheet('Add text', { text: '', size: st.size, color: st.color, font: st.font, bold: st.bold });
    if (!r || !r.text.trim()) return;
    Object.assign(st, { size: r.size, color: r.color, font: r.font, bold: r.bold });
    const a: TextAnnot = { id: uid(), type: 'text', x: p.x, y: p.y - r.size * 0.6, text: r.text, size: r.size, color: r.color, font: r.font, bold: r.bold };
    addAnnot(page, a, true);
  }

  async function editTextAnnot(page: number, a: TextAnnot) {
    const r = await textSheet('Edit text', a, { onDelete: () => { select({ page, id: a.id }); deleteSelected(); } });
    if (!r) return;
    snapshot();
    Object.assign(a, r);
    if (a.bgBox) {
      const m = measureText(a);
      a.bgBox.w = Math.max(a.bgBox.w, m.w + 2);
      a.bgBox.h = Math.max(a.bgBox.h, m.h);
    }
    renderAnnots(page);
    markDirty();
  }

  function sampleColors(v: PageView, l: TextLine): { bg: string; fg: string } {
    const ctx = v.canvas.getContext('2d', { willReadFrequently: true });
    if (!v.renderedScale || !ctx) return { bg: '#ffffff', fg: '#111111' };
    const k = v.canvas.width / v.bw;
    const x0 = Math.max(0, Math.floor((l.x - 2) * k)), y0 = Math.max(0, Math.floor((l.y - 2) * k));
    const w = Math.min(v.canvas.width - x0, Math.ceil((l.w + 4) * k)), hh = Math.min(v.canvas.height - y0, Math.ceil((l.h + 4) * k));
    if (w <= 0 || hh <= 0) return { bg: '#ffffff', fg: '#111111' };
    const d = ctx.getImageData(x0, y0, w, hh).data;
    // background: median of the border pixels; foreground: darkest-ish pixel far from bg
    const border: number[][] = [];
    for (let x = 0; x < w; x++) { border.push(px(d, x, 0, w)); border.push(px(d, x, hh - 1, w)); }
    for (let y = 0; y < hh; y++) { border.push(px(d, 0, y, w)); border.push(px(d, w - 1, y, w)); }
    const med = [0, 1, 2].map((c) => border.map((p) => p[c]).sort((a, b) => a - b)[border.length >> 1]);
    let best = med, bestD = -1;
    for (let i = 0; i < d.length; i += 4) {
      const dd = Math.abs(d[i] - med[0]) + Math.abs(d[i + 1] - med[1]) + Math.abs(d[i + 2] - med[2]);
      if (dd > bestD) { bestD = dd; best = [d[i], d[i + 1], d[i + 2]]; }
    }
    const hex = (c: number[]) => '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('');
    return { bg: hex(med), fg: bestD > 60 ? hex(best) : '#111111' };
  }
  const px = (d: Uint8ClampedArray, x: number, y: number, w: number) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

  async function renderTextLayer(v: PageView) {
    clear(v.textLayer);
    if (mode !== 'text') return;
    if (!v.lines) {
      try { v.lines = await getTextLines(v.page); } catch { v.lines = []; }
    }
    if (mode !== 'text') return;
    const editedKeys = new Set(list(v.index).filter((a) => a.type === 'text' && (a as any).srcKey).map((a: any) => a.srcKey));
    v.lines.forEach((l, li) => {
      const key = `${v.index}:${li}`;
      if (editedKeys.has(key)) return;
      const box = h('div', { class: 'tl-line', style: { left: l.x + 'px', top: l.y + 'px', width: l.w + 'px', height: l.h + 'px' }, title: l.text });
      box.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (tool !== 'pan') return;
        const colors = sampleColors(v, l);
        const r = await textSheet('Edit text', { text: l.text, size: l.size, color: colors.fg, font: l.font, bold: l.bold });
        if (!r) return;
        const a: TextAnnot & { srcKey: string } = {
          id: uid(), type: 'text', x: l.x, y: l.baseline - r.size * ASCENT, text: r.text, size: r.size, color: r.color, font: r.font, bold: r.bold,
          bg: colors.bg, bgBox: { x: l.x - 1, y: l.y - 1, w: l.w + 2, h: l.h + 2 }, srcKey: key,
        };
        const m = measureText(a);
        a.bgBox!.w = Math.max(a.bgBox!.w, m.w + 2);
        a.bgBox!.h = Math.max(a.bgBox!.h, a.y + m.h - a.bgBox!.y);
        addAnnot(v.index, a);
        renderTextLayer(v);
      });
      v.textLayer.appendChild(box);
    });
    if (!v.lines.length && v.index === currentPageIndex()) toast('No editable text on this page. Scanned page? Run OCR first, or use Add text.', 3500);
  }

  // ---------------- forms ----------------
  function renderForm(v: PageView) {
    clear(v.formLayer);
    const ws = formWidgets.filter((w) => w.pageIndex === v.index);
    for (const w of ws) {
      const r = v.vp1.convertToViewportRectangle(w.rect);
      const x = Math.min(r[0], r[2]), y = Math.min(r[1], r[3]), ww = Math.abs(r[2] - r[0]), hh = Math.abs(r[3] - r[1]);
      const pos = { left: x + 'px', top: y + 'px', width: ww + 'px', height: hh + 'px' };
      const val = formValues.get(w.fieldName);
      const setVal = (nv: FieldValue) => {
        snapshot();
        formValues.set(w.fieldName, nv);
        formDirty = true;
        markDirty();
      };
      let node: HTMLElement;
      if (w.kind === 'text') {
        const fs = w.fontSize || Math.max(6, Math.min(14, hh * (w.multiline ? 0.4 : 0.65)));
        const inp = (w.multiline ? h('textarea', { class: 'form-field ff-text' }) : h('input', { class: 'form-field ff-text', type: 'text' })) as HTMLInputElement;
        inp.value = String(val ?? '');
        if (w.maxLength) inp.maxLength = w.maxLength;
        inp.disabled = !!w.readOnly;
        inp.style.fontSize = fs + 'px';
        inp.addEventListener('change', () => setVal(inp.value));
        inp.addEventListener('focus', () => (formFocus = formWidgets.indexOf(w)));
        node = inp;
      } else if (w.kind === 'checkbox') {
        node = h('button', { class: 'form-field ff-check' + (val ? ' on' : ''), disabled: !!w.readOnly, 'aria-label': w.fieldName, onclick: () => { setVal(!formValues.get(w.fieldName)); views.forEach(renderForm); } }, val ? '✓' : '');
        node.style.fontSize = hh * 0.85 + 'px';
      } else if (w.kind === 'radio') {
        const on = val === w.option;
        node = h('button', { class: 'form-field ff-radio' + (on ? ' on' : ''), disabled: !!w.readOnly, 'aria-label': `${w.fieldName}: ${w.option}`, onclick: () => { setVal(w.option!); views.forEach(renderForm); } }, h('span'));
      } else if (w.kind === 'dropdown' || w.kind === 'list') {
        const sel = h('select', { class: 'form-field ff-select', multiple: w.kind === 'list' && false }) as HTMLSelectElement;
        sel.appendChild(h('option', { value: '' }, ''));
        (w.options || []).forEach((o) => sel.appendChild(h('option', { value: o }, o)));
        sel.value = Array.isArray(val) ? val[0] || '' : String(val ?? '');
        sel.disabled = !!w.readOnly;
        sel.style.fontSize = Math.max(6, Math.min(14, hh * 0.6)) + 'px';
        sel.addEventListener('change', () => setVal(w.kind === 'list' ? (sel.value ? [sel.value] : []) : sel.value));
        node = sel;
      } else {
        node = h('button', { class: 'form-field ff-sign', onclick: async () => {
          const sig = await getSignature();
          if (!sig) return;
          const img = await loadImg(sig);
          const s = Math.min(ww / img.width, hh / img.height);
          addAnnot(v.index, { id: uid(), type: 'image', src: sig, x: x + (ww - img.width * s) / 2, y: y + (hh - img.height * s) / 2, w: img.width * s, h: img.height * s });
        } }, 'Sign here');
      }
      Object.assign(node.style, pos);
      v.formLayer.appendChild(node);
    }
  }
  let formFocus = -1;
  function nextField() {
    const order = formWidgets.filter((w) => !w.readOnly);
    if (!order.length) return;
    formFocus = (formFocus + 1) % formWidgets.length;
    let w = formWidgets[formFocus];
    let guard = 0;
    while (w.readOnly && guard++ < formWidgets.length) { formFocus = (formFocus + 1) % formWidgets.length; w = formWidgets[formFocus]; }
    const v = views[w.pageIndex];
    const nodes = Array.from(v.formLayer.children) as HTMLElement[];
    const idx = formWidgets.filter((x) => x.pageIndex === w.pageIndex).indexOf(w);
    const n = nodes[idx];
    if (n) {
      n.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => n.focus(), 300);
    }
  }

  async function loadForms() {
    try {
      const doc = await loadPdfLib(bytes);
      encrypted = doc.isEncrypted;
      const info = await readForm(doc);
      formWidgets = info.widgets;
      formValues = info.values;
      formDirty = false;
      if (hasXfa(doc)) showBanner('This form uses XFA; some fields may not be editable. Use the Text and Check tools to fill it in.');
      else if (formWidgets.length) showBanner(`This document has ${new Set(formWidgets.map((w) => w.fieldName)).size} fillable fields.`, 'Fill form', () => setMode('form'));
      if (encrypted) showBanner('This PDF is encrypted. Viewing works; saving changes may not be possible.');
    } catch (e) {
      console.warn('form read failed', e);
      formWidgets = [];
    }
  }
  let bannerShown = false;
  function showBanner(text: string, action?: string, fn?: () => void) {
    if (bannerShown) return;
    bannerShown = true;
    clear(formBanner);
    formBanner.classList.remove('hidden');
    formBanner.append(icon('info', 18), h('span', null, text));
    if (action) formBanner.append(h('button', { class: 'btn small primary', onclick: () => { formBanner.classList.add('hidden'); fn?.(); } }, action));
    formBanner.append(iconBtn('x', 'Dismiss', () => formBanner.classList.add('hidden')));
  }

  // ---------------- insert helpers ----------------
  function centerOfCurrent(): { page: number; x: number; y: number } {
    const i = currentPageIndex();
    const v = views[i];
    const r = v.box.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    const cy = (Math.max(r.top, sr.top) + Math.min(r.bottom, sr.bottom)) / 2;
    const s = cssScale();
    return { page: i, x: v.bw / 2, y: Math.max(20, Math.min(v.bh - 20, (cy - r.top) / s)) };
  }
  const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  async function placeImage(src: string, widthFrac = 0.35) {
    const c = centerOfCurrent();
    const v = views[c.page];
    const img = await loadImg(src);
    const w = v.bw * widthFrac, hh = (w * img.height) / img.width;
    addAnnot(c.page, { id: uid(), type: 'image', src, x: c.x - w / 2, y: c.y - hh / 2, w, h: hh }, true);
    tool = 'select';
    renderSubBar();
    applyToolClass();
    toast('Drag to position. Use the corner handle to resize.');
  }
  async function addSignature() {
    const sig = await getSignature();
    if (sig) placeImage(sig, 0.3);
  }
  async function addInitials() {
    const sig = await getSignature();
    if (sig) placeImage(sig, 0.12);
  }
  async function addImage() {
    const [f] = await pickFiles('image/*', false);
    if (!f) return;
    const { fileToCanvas, downscale } = await import('../scanner/process');
    const c = downscale(await fileToCanvas(f, 2000), 2000);
    const isPng = f.type === 'image/png';
    placeImage(c.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.9), 0.5);
  }
  async function addStamp() {
    const today = new Date().toLocaleDateString();
    const v = await choose('Stamp', [
      { label: 'APPROVED', value: 'APPROVED' },
      { label: 'REJECTED', value: 'REJECTED' },
      { label: 'DRAFT', value: 'DRAFT' },
      { label: 'CONFIDENTIAL', value: 'CONFIDENTIAL' },
      { label: 'PAID', value: 'PAID' },
      { label: 'RECEIVED ' + today, value: 'RECEIVED ' + today },
      { label: 'Custom…', value: '__custom' },
    ]);
    if (!v) return;
    const text = v === '__custom' ? await promptDlg('Stamp text', '') : v;
    if (!text) return;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const fs = 64;
    ctx.font = `bold ${fs}px Helvetica, Arial, sans-serif`;
    const tw = ctx.measureText(text).width;
    c.width = tw + 60;
    c.height = fs + 50;
    const color = /REJECT|CONFIDENTIAL/.test(text) ? '#dc2626' : /DRAFT/.test(text) ? '#6b7280' : '#16a34a';
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.beginPath();
    (ctx as any).roundRect ? (ctx as any).roundRect(6, 6, c.width - 12, c.height - 12, 14) : ctx.rect(6, 6, c.width - 12, c.height - 12);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold ${fs}px Helvetica, Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 30, c.height / 2 + 3);
    placeImage(c.toDataURL('image/png'), Math.min(0.6, 0.06 * text.length));
  }
  function addDate() {
    const c = centerOfCurrent();
    placeText(c.page, { x: c.x - 40, y: c.y }, new Date().toLocaleDateString());
  }

  // ---------------- saving ----------------
  async function persist(newBytes: Uint8Array, msg = 'Saved') {
    bytes = newBytes;
    meta.updatedAt = Date.now();
    try {
      const t = await makeThumb(bytes);
      meta.thumb = t.thumb;
      meta.pages = t.pages;
    } catch { /* ignore */ }
    await saveDoc(meta, bytes);
    deps.onSaved(meta);
    await reload();
    toast(msg);
  }

  async function reload(keepScroll = true) {
    const st = scroller.scrollTop / Math.max(1, scroller.scrollHeight);
    const old = pdf;
    pdf = (await openPdfJsInteractive(bytes, async () => password ?? null)).doc;
    old.destroy();
    annots.clear();
    undoStack.length = redoStack.length = 0;
    selected = null;
    await loadForms();
    await buildPages();
    dirty = false;
    saveBtn.classList.remove('attention');
    if (keepScroll) requestAnimationFrame(() => (scroller.scrollTop = st * scroller.scrollHeight));
    renderSubBar();
    if (mode === 'text') views.forEach((v) => renderTextLayer(v));
  }

  /** Burn pending edits into the PDF. Returns true on success. */
  async function save(): Promise<boolean> {
    if (!dirty) {
      toast('No changes to save');
      return true;
    }
    const b = busy('Saving…');
    try {
      const doc = await loadPdfLib(bytes);
      const pages = doc.getPages();
      const redactPages: number[] = [];
      for (const [i, l] of annots) {
        if (!l.length || !pages[i]) continue;
        await drawAnnots(doc, pages[i], l, views[i].vp1);
        if (l.some((a) => a.type === 'redact')) redactPages.push(i);
      }
      if (formDirty) {
        const probs = await writeForm(doc, formValues);
        if (probs.length) toast(`Some fields could not be saved: ${probs.slice(0, 3).join(', ')}`);
      }
      let out = await doc.save();
      if (redactPages.length) {
        b.update('Applying secure redaction…');
        out = await rasterizePages(out, redactPages);
      }
      b.done();
      await persist(out, redactPages.length ? 'Saved — redacted pages were flattened so hidden text is permanently removed' : 'Saved');
      return true;
    } catch (e: any) {
      b.done();
      console.error(e);
      toast('Save failed: ' + (e?.message || e), 4000);
      return false;
    }
  }

  /** Replace pages with flattened images so redacted content is truly removed. */
  async function rasterizePages(input: Uint8Array, idx: number[]): Promise<Uint8Array> {
    const { openPdfJs } = await import('../pdf');
    const pj = await openPdfJs(input, password);
    const doc = await loadPdfLib(input);
    for (const i of idx) {
      const page = await pj.getPage(i + 1);
      const vp = page.getViewport({ scale: 1 });
      const c = await renderPageToCanvas(page, 200 / 72);
      const img = await doc.embedJpg(await canvasToBytes(c, 'image/jpeg', 0.9));
      const np = doc.insertPage(i + 1, [vp.width, vp.height]);
      np.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
      doc.removePage(i);
    }
    pj.destroy();
    return doc.save();
  }

  async function ensureSaved(): Promise<boolean> {
    if (!dirty) return true;
    const ok = await confirmDlg('Save changes first?', 'Your pending edits will be saved into the document before continuing.', 'Save & continue');
    if (!ok) return false;
    return save();
  }

  // ---------------- organizer ----------------
  async function organizer() {
    if (!(await ensureSaved())) return;
    openOrganizer({
      bytes: () => bytes,
      pdf: () => pdf,
      apply: (nb, msg) => persist(nb, msg),
      scan: (mode, onBytes) => deps.startScan(mode, onBytes),
      scrollTo: (i) => views[i]?.box.scrollIntoView({ block: 'start' }),
      extract: async (nb, name) => {
        const { createDocFromBytes } = await import('../library');
        await createDocFromBytes(nb, name, false);
        toast(`Saved "${name}" to your library`);
      },
    });
  }

  // ---------------- OCR ----------------
  async function ocrMenu() {
    if (!(await ensureSaved())) return;
    const langSel = h('select', { class: 'field' }, OCR_LANGS.map((l) => h('option', { value: l.code }, l.label))) as HTMLSelectElement;
    langSel.value = getOcrLang();
    const run = (scope: string) => { s.close(); setOcrLang(langSel.value); runOcr(scope, langSel.value); };
    const s = sheet('Recognize text (OCR)', [
      h('p', { class: 'sheet-msg' }, 'Turns scanned pages into searchable, selectable, editable text. Runs on your device; the language pack downloads once.'),
      h('label', { class: 'form-row' }, h('span', null, 'Language'), langSel),
      h('div', { class: 'menu-list' },
        h('button', { class: 'menu-item', onclick: () => run('current') }, icon('file'), h('div', { class: 'menu-text' }, h('div', null, 'Current page'), h('small', null, `Page ${currentPageIndex() + 1}`))),
        h('button', { class: 'menu-item', onclick: () => run('needed') }, icon('wand'), h('div', { class: 'menu-text' }, h('div', null, 'Pages without text'), h('small', null, 'Skips pages that already have text'))),
        h('button', { class: 'menu-item', onclick: () => run('all') }, icon('files'), h('div', { class: 'menu-text' }, h('div', null, 'All pages'), h('small', null, `${views.length} page(s)`))),
        h('button', { class: 'menu-item', onclick: () => { s.close(); extractText(); } }, icon('copy'), h('div', { class: 'menu-text' }, h('div', null, 'Show / copy document text'), h('small', null, 'Uses existing text layer'))),
      ),
    ]);
  }

  async function runOcr(scope: string, lang: string) {
    const b = busy('Preparing OCR…');
    try {
      let targets: number[] = [];
      if (scope === 'current') targets = [currentPageIndex()];
      else if (scope === 'all') targets = views.map((v) => v.index);
      else {
        for (const v of views) {
          const t = await getPageText(v.page);
          if (t.replace(/\s/g, '').length < 20) targets.push(v.index);
        }
        if (!targets.length) {
          b.done();
          toast('Every page already has text');
          return;
        }
      }
      const doc = await loadPdfLib(bytes);
      const pages = doc.getPages();
      let texts: string[] = [];
      for (let k = 0; k < targets.length; k++) {
        const i = targets[k];
        const v = views[i];
        const target = 2400 / Math.max(v.bw, v.bh);
        const scale = Math.max(2, Math.min(4, target));
        b.update(`Rendering page ${i + 1}…`);
        await nextFrame();
        const vp = v.page.getViewport({ scale });
        const canvas = await renderPageToCanvas(v.page, scale);
        const res = await recognizeCanvas(canvas, lang, (p, st) => b.update(st.includes('recogniz') ? `Reading page ${i + 1} (${k + 1}/${targets.length}) ${Math.round(p * 100)}%` : `Loading OCR engine… ${Math.round(p * 100)}%`));
        texts.push(`--- Page ${i + 1} ---\n` + res.text.trim());
        isolatePageContent(doc, pages[i]);
        await addTextLayer(doc, pages[i], res.words, (x, y) => vp.convertToPdfPoint(x, y) as [number, number], vp.rotation);
      }
      b.update('Saving…');
      const out = await doc.save();
      b.done();
      await persist(out, 'Text recognized — the document is now searchable');
      showText(texts.join('\n\n'), 'Recognized text');
    } catch (e: any) {
      b.done();
      console.error(e);
      toast('OCR failed: ' + (e?.message || 'check your internet connection for the first download'), 4500);
    }
  }

  function showText(text: string, title: string) {
    const ta = h('textarea', { class: 'field mono', rows: 14, readonly: true }) as HTMLTextAreaElement;
    ta.value = text || '(no text found)';
    const s = sheet(title, [
      ta,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: () => shareOrDownload(new Blob([text], { type: 'text/plain' }), safeFilename(meta.name, '.txt')) }, icon('share', 16), 'Share .txt'),
        h('button', { class: 'btn primary', onclick: async () => {
          try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { ta.select(); document.execCommand('copy'); toast('Copied'); }
        } }, icon('copy', 16), 'Copy'),
      ),
    ], { full: true });
    void s;
  }

  async function extractText() {
    const b = busy('Extracting text…');
    const parts: string[] = [];
    for (const v of views) parts.push(await getPageText(v.page));
    b.done();
    const text = parts.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n');
    if (!parts.join('').trim()) toast('No text layer found — run OCR to recognize scanned text', 3500);
    showText(text, 'Document text');
  }

  // ---------------- search ----------------
  let searchHits: { page: number; x: number; y: number; w: number; h: number }[] = [];
  let hitIdx = -1;
  function toggleSearch() {
    if (!searchBar.classList.contains('hidden')) {
      searchBar.classList.add('hidden');
      views.forEach((v) => clear(v.hlLayer));
      return;
    }
    clear(searchBar);
    const input = h('input', { class: 'field', type: 'search', placeholder: 'Search in document' }) as HTMLInputElement;
    const count = h('span', { class: 'search-count' }, '');
    const go = async () => {
      const q = input.value.trim().toLowerCase();
      views.forEach((v) => clear(v.hlLayer));
      searchHits = [];
      hitIdx = -1;
      if (!q) { count.textContent = ''; return; }
      for (const v of views) {
        if (!v.lines) v.lines = await getTextLines(v.page);
        for (const l of v.lines) {
          const t = l.text.toLowerCase();
          let pos = t.indexOf(q);
          while (pos >= 0) {
            const cw = l.w / Math.max(1, l.text.length);
            searchHits.push({ page: v.index, x: l.x + pos * cw, y: l.y, w: q.length * cw, h: l.h });
            pos = t.indexOf(q, pos + q.length);
          }
        }
      }
      for (const hit of searchHits) views[hit.page].hlLayer.appendChild(h('div', { class: 'hl', style: { left: hit.x + 'px', top: hit.y + 'px', width: hit.w + 'px', height: hit.h + 'px' } }));
      count.textContent = searchHits.length ? `${searchHits.length} found` : 'No matches';
      if (searchHits.length) step(1);
      else if (!views.some((v) => v.lines?.length)) toast('This document has no text layer. Run OCR to make it searchable.', 3500);
    };
    const step = (d: number) => {
      if (!searchHits.length) return;
      hitIdx = (hitIdx + d + searchHits.length) % searchHits.length;
      const hit = searchHits[hitIdx];
      const v = views[hit.page];
      const s = cssScale();
      views.forEach((vv) => vv.hlLayer.querySelectorAll('.hl.cur').forEach((n) => n.classList.remove('cur')));
      const nodes = Array.from(v.hlLayer.children);
      const local = searchHits.filter((x) => x.page === hit.page).indexOf(hit);
      nodes[local]?.classList.add('cur');
      scroller.scrollTop = v.box.offsetTop + hit.y * s - scroller.clientHeight / 3;
      count.textContent = `${hitIdx + 1} / ${searchHits.length}`;
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (searchHits.length && input.dataset.q === input.value) step(1); else { input.dataset.q = input.value; go(); } } });
    searchBar.append(input, count, iconBtn('left', 'Previous', () => step(-1)), iconBtn('right', 'Next', () => step(1)), iconBtn('x', 'Close search', () => toggleSearch()));
    searchBar.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);
  }

  // ---------------- more menu ----------------
  async function rename() {
    const n = await promptDlg('Rename document', meta.name);
    if (!n || !n.trim()) return;
    meta.name = n.trim();
    titleEl.textContent = meta.name;
    const { updateMeta } = await import('../store');
    await updateMeta(meta);
    deps.onSaved(meta);
  }

  async function moreMenu() {
    const c = await choose('Document', [
      { label: 'Share', value: 'share', icon: 'share', desc: 'Send to another app, email or messages' },
      { label: 'Download / Save to files', value: 'download', icon: 'download' },
      { label: 'Print / open in viewer', value: 'print', icon: 'file' },
      { label: 'Export current page as image', value: 'img', icon: 'image' },
      { label: 'Add page numbers', value: 'numbers', icon: 'type' },
      { label: 'Add watermark', value: 'watermark', icon: 'stamp' },
      { label: 'Flatten form fields', value: 'flatten', icon: 'form', desc: 'Make filled-in values permanent' },
      { label: 'Reduce file size', value: 'compress', icon: 'merge', desc: 'Re-compress pages as images' },
      { label: 'Copy document text', value: 'text', icon: 'copy' },
      { label: 'Rename', value: 'rename', icon: 'edit' },
      { label: 'Document info', value: 'info', icon: 'info' },
    ]);
    if (!c) return;
    if (['share', 'download', 'print', 'numbers', 'watermark', 'flatten', 'compress', 'img'].includes(c) && !(await ensureSaved())) return;
    const blob = () => new Blob([bytes], { type: 'application/pdf' });
    switch (c) {
      case 'share': return shareOrDownload(blob(), safeFilename(meta.name));
      case 'download': return downloadBlob(blob(), safeFilename(meta.name));
      case 'print': {
        const url = URL.createObjectURL(blob());
        const w = window.open(url, '_blank');
        if (!w) downloadBlob(blob(), safeFilename(meta.name));
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }
      case 'img': {
        const v = views[currentPageIndex()];
        const b = busy('Rendering…');
        const canvas = await renderPageToCanvas(v.page, 200 / 72);
        const out = await canvasToBlob(canvas, 'image/jpeg', 0.92);
        b.done();
        return shareOrDownload(out, safeFilename(`${meta.name} - page ${v.index + 1}`, '.jpg'));
      }
      case 'numbers': return addPageNumbers();
      case 'watermark': return addWatermark();
      case 'flatten': {
        const b = busy('Flattening…');
        try {
          const doc = await loadPdfLib(bytes);
          await writeForm(doc, new Map(), true);
          const out = await doc.save();
          b.done();
          return persist(out, 'Form flattened');
        } catch (e: any) { b.done(); toast('Flatten failed: ' + e?.message); }
        return;
      }
      case 'compress': return compress();
      case 'text': return extractText();
      case 'rename': return rename();
      case 'info': {
        const doc = await loadPdfLib(bytes).catch(() => null);
        sheet('Document info', h('div', { class: 'info-list' },
          infoRow('Name', meta.name),
          infoRow('Pages', String(pdf.numPages)),
          infoRow('Size', formatBytes(bytes.byteLength)),
          infoRow('Fillable fields', String(new Set(formWidgets.map((w) => w.fieldName)).size)),
          infoRow('Title', doc?.getTitle() || '—'),
          infoRow('Author', doc?.getAuthor() || '—'),
          infoRow('Producer', doc?.getProducer() || '—'),
          infoRow('Created', new Date(meta.createdAt).toLocaleString()),
          infoRow('Modified', new Date(meta.updatedAt).toLocaleString()),
        ));
      }
    }
  }
  const infoRow = (k: string, v: string) => h('div', { class: 'info-row' }, h('span', null, k), h('b', null, v));

  async function addPageNumbers() {
    const pos = await choose('Page numbers', [
      { label: 'Bottom center  —  "1"', value: 'bc' },
      { label: 'Bottom right  —  "Page 1 of N"', value: 'br' },
      { label: 'Top right  —  "1"', value: 'tr' },
    ]);
    if (!pos) return;
    const b = busy('Numbering pages…');
    try {
      const doc = await loadPdfLib(bytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();
      pages.forEach((p, i) => {
        isolatePageContent(doc, p);
        const v = views[i].vp1;
        const label = pos === 'br' ? `Page ${i + 1} of ${pages.length}` : String(i + 1);
        const size = 10;
        const tw = font.widthOfTextAtSize(label, size);
        const bx = pos === 'bc' ? v.width / 2 - tw / 2 : v.width - 36 - tw;
        const by = pos === 'tr' ? 28 : v.height - 22;
        const [x, y] = v.convertToPdfPoint(bx, by);
        p.drawText(label, { x, y, size, font, color: rgb(0.25, 0.25, 0.25), rotate: degrees(v.rotation) });
      });
      const out = await doc.save();
      b.done();
      await persist(out, 'Page numbers added');
    } catch (e: any) { b.done(); toast('Failed: ' + e?.message); }
  }

  async function addWatermark() {
    const text = await promptDlg('Watermark text', 'CONFIDENTIAL');
    if (!text) return;
    const b = busy('Adding watermark…');
    try {
      const doc = await loadPdfLib(bytes);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const t = sanitizeForFont(font, text);
      doc.getPages().forEach((p, i) => {
        isolatePageContent(doc, p);
        const v = views[i].vp1;
        const diag = Math.hypot(v.width, v.height);
        const size = Math.min(120, (diag * 0.7) / Math.max(1, font.widthOfTextAtSize(t, 1)));
        const tw = font.widthOfTextAtSize(t, size);
        const ang = -Math.atan2(v.height, v.width); // display angle: bottom-left to top-right
        const cx = v.width / 2, cy = v.height / 2;
        const sx = cx - (Math.cos(ang) * tw) / 2 - Math.sin(ang) * size * 0.35;
        const sy = cy - (Math.sin(ang) * tw) / 2 + Math.cos(ang) * size * 0.35;
        const [x, y] = v.convertToPdfPoint(sx, sy);
        p.drawText(t, { x, y, size, font, color: rgb(0.6, 0.6, 0.6), opacity: 0.25, rotate: degrees(v.rotation - (ang * 180) / Math.PI) });
      });
      const out = await doc.save();
      b.done();
      await persist(out, 'Watermark added');
    } catch (e: any) { b.done(); toast('Failed: ' + e?.message); }
  }

  async function compress() {
    const q = await choose('Reduce file size', [
      { label: 'Balanced (150 dpi)', value: 150, desc: 'Good for reading and printing' },
      { label: 'Small (110 dpi)', value: 110, desc: 'Good for email' },
      { label: 'Smallest (80 dpi)', value: 80, desc: 'Screen reading only' },
    ], 'Pages are converted to compressed images. Text stays searchable only if you run OCR afterwards.');
    if (!q) return;
    const b = busy('Compressing…');
    try {
      const doc = await PDFDocument.create();
      for (const v of views) {
        b.update(`Compressing page ${v.index + 1} of ${views.length}…`);
        await nextFrame();
        const c = await renderPageToCanvas(v.page, q / 72);
        const img = await doc.embedJpg(await canvasToBytes(c, 'image/jpeg', q >= 150 ? 0.78 : 0.65));
        const p = doc.addPage([v.bw, v.bh]);
        p.drawImage(img, { x: 0, y: 0, width: v.bw, height: v.bh });
      }
      const out = await doc.save();
      b.done();
      if (out.byteLength >= bytes.byteLength) {
        toast('This document is already compact — kept the original');
        return;
      }
      const before = bytes.byteLength;
      await persist(out, `Reduced from ${formatBytes(before)} to ${formatBytes(out.byteLength)}`);
    } catch (e: any) { b.done(); toast('Failed: ' + e?.message); }
  }

  // ---------------- init ----------------
  renderModeBar();
  renderSubBar();
  applyToolClass();
  await loadForms();
  await buildPages();
  void hexToRgb01; void getStdFont;
}
