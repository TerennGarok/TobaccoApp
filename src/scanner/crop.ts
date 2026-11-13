// Adjustable crop frame: 4 corner handles + 4 edge handles + magnifier loupe.
import { h, icon } from '../ui';
import { Pt, Quad, fullQuad, isConvex } from './geometry';
import { detectDocument } from './detect';
import { downscale } from './process';

export interface CropOptions {
  source: HTMLCanvasElement;
  quad: Quad;
  detected: boolean;
  pageNumber: number;
  onDone(q: Quad): void;
  onRetake?(): void;
  onCancel(): void;
}

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag: string, attrs: Record<string, any> = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export function cropView(opts: CropOptions): { el: HTMLElement; destroy(): void } {
  const src = opts.source;
  const W = src.width, H = src.height;
  let quad: Quad = opts.quad.map((p) => ({ ...p })) as Quad;
  const preview = downscale(src, 1600);

  const stage = h('div', { class: 'crop-stage' });
  const wrap = h('div', { class: 'crop-wrap' });
  const img = h('canvas', { class: 'crop-img' });
  img.width = preview.width;
  img.height = preview.height;
  img.getContext('2d')!.drawImage(preview, 0, 0);
  const svg = svgEl('svg', { class: 'crop-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' }) as SVGSVGElement;
  const shade = svgEl('path', { class: 'crop-shade', 'fill-rule': 'evenodd' });
  const outline = svgEl('polygon', { class: 'crop-outline' });
  svg.append(shade, outline);
  const cornerEls = quad.map((_, i) => {
    const g = svgEl('g', { class: 'crop-handle', 'data-i': i });
    g.append(svgEl('circle', { class: 'hit', r: 1 }), svgEl('circle', { class: 'dot', r: 1 }));
    svg.append(g);
    return g;
  });
  const edgeEls = [0, 1, 2, 3].map((i) => {
    const g = svgEl('g', { class: 'crop-edge', 'data-e': i });
    g.append(svgEl('circle', { class: 'hit', r: 1 }), svgEl('rect', { class: 'bar' }));
    svg.append(g);
    return g;
  });
  wrap.append(img, svg);
  const loupe = h('canvas', { class: 'loupe' });
  loupe.width = loupe.height = 220;
  stage.append(wrap, loupe);

  const status = h('div', { class: 'crop-status' }, opts.detected ? 'Edges detected — drag the handles to adjust' : 'No edges found — drag the corners to the document edges');

  const el = h(
    'div',
    { class: 'crop-screen' },
    h('div', { class: 'top-bar dark' },
      h('button', { class: 'icon-btn', onclick: () => opts.onCancel(), 'aria-label': 'Cancel' }, icon('x')),
      h('div', { class: 'top-title' }, `Adjust page ${opts.pageNumber}`),
      h('div', { class: 'spacer-btn' }),
    ),
    status,
    stage,
    h('div', { class: 'crop-actions' },
      opts.onRetake ? h('button', { class: 'tool-btn light', onclick: () => opts.onRetake!() }, icon('camera'), h('span', null, 'Retake')) : null,
      h('button', { class: 'tool-btn light', onclick: () => autoDetect() }, icon('wand'), h('span', null, 'Auto')),
      h('button', { class: 'tool-btn light', onclick: () => setQuad(fullQuad(W, H), 'Using the full image') }, icon('crop'), h('span', null, 'Full')),
      h('button', { class: 'btn primary next-btn', onclick: () => {
        if (!isConvex(quad)) { status.textContent = 'The frame must not cross over itself'; return; }
        opts.onDone(quad);
      } }, 'Next', icon('right', 18)),
    ),
  );

  let k = 1; // svg units per CSS px
  function layout() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const pad = 24;
    const s = Math.min((r.width - pad * 2) / W, (r.height - pad * 2) / H);
    wrap.style.width = W * s + 'px';
    wrap.style.height = H * s + 'px';
    k = 1 / s;
    render();
  }

  function render() {
    const pts = quad.map((p) => `${p.x},${p.y}`).join(' ');
    outline.setAttribute('points', pts);
    outline.setAttribute('stroke-width', String(2.5 * k));
    shade.setAttribute('d', `M0 0H${W}V${H}H0Z M${quad.map((p) => `${p.x} ${p.y}`).join(' L')} Z`);
    cornerEls.forEach((g, i) => {
      const [hit, dot] = g.children as any;
      hit.setAttribute('cx', quad[i].x); hit.setAttribute('cy', quad[i].y); hit.setAttribute('r', 26 * k);
      dot.setAttribute('cx', quad[i].x); dot.setAttribute('cy', quad[i].y); dot.setAttribute('r', 11 * k);
      dot.setAttribute('stroke-width', 3 * k);
    });
    edgeEls.forEach((g, i) => {
      const a = quad[i], b = quad[(i + 1) % 4];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const [hit, bar] = g.children as any;
      hit.setAttribute('cx', mx); hit.setAttribute('cy', my); hit.setAttribute('r', 20 * k);
      const bw = 30 * k, bh = 8 * k;
      bar.setAttribute('x', mx - bw / 2); bar.setAttribute('y', my - bh / 2);
      bar.setAttribute('width', bw); bar.setAttribute('height', bh); bar.setAttribute('rx', bh / 2);
      bar.setAttribute('transform', `rotate(${ang} ${mx} ${my})`);
      bar.setAttribute('stroke-width', 2 * k);
    });
  }

  function setQuad(q: Quad, msg?: string) {
    quad = q.map((p) => ({ ...p })) as Quad;
    if (msg) status.textContent = msg;
    render();
  }

  function autoDetect() {
    const q = detectDocument(src, W, H, 420);
    if (q) setQuad(q, 'Edges detected — drag the handles to adjust');
    else status.textContent = 'Could not find the document edges — adjust manually';
  }

  // ---- dragging ----
  let drag: { kind: 'c' | 'e'; i: number; start: Pt; orig: Quad; pid: number } | null = null;
  const toImg = (e: PointerEvent): Pt => {
    const r = wrap.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const clampPt = (p: Pt): Pt => ({ x: Math.max(0, Math.min(W, p.x)), y: Math.max(0, Math.min(H, p.y)) });

  svg.addEventListener('pointerdown', (e) => {
    const p = toImg(e);
    const tol = 34 * k;
    let best = -1, bestD = Infinity, kind: 'c' | 'e' = 'c';
    quad.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) { bestD = d; best = i; kind = 'c'; }
    });
    quad.forEach((q, i) => {
      const b = quad[(i + 1) % 4];
      const d = Math.hypot((q.x + b.x) / 2 - p.x, (q.y + b.y) / 2 - p.y);
      if (d < bestD - 6 * k) { bestD = d; best = i; kind = 'e'; }
    });
    if (best < 0 || bestD > tol) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    drag = { kind, i: best, start: p, orig: quad.map((q) => ({ ...q })) as Quad, pid: e.pointerId };
    showLoupe(e, kind === 'c' ? quad[best] : p);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const p = toImg(e);
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (drag.kind === 'c') {
      quad[drag.i] = clampPt({ x: drag.orig[drag.i].x + dx, y: drag.orig[drag.i].y + dy });
      showLoupe(e, quad[drag.i]);
    } else {
      const a = drag.i, b = (drag.i + 1) % 4;
      quad[a] = clampPt({ x: drag.orig[a].x + dx, y: drag.orig[a].y + dy });
      quad[b] = clampPt({ x: drag.orig[b].x + dx, y: drag.orig[b].y + dy });
      showLoupe(e, { x: (quad[a].x + quad[b].x) / 2, y: (quad[a].y + quad[b].y) / 2 });
    }
    render();
  });
  const end = () => {
    drag = null;
    loupe.classList.remove('show');
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  function showLoupe(e: PointerEvent, at: Pt) {
    const sr = stage.getBoundingClientRect();
    const size = 110;
    let lx = e.clientX - sr.left - size / 2;
    let ly = e.clientY - sr.top - size - 60;
    if (ly < 0) ly = e.clientY - sr.top + 50;
    lx = Math.max(4, Math.min(sr.width - size - 4, lx));
    loupe.style.left = lx + 'px';
    loupe.style.top = ly + 'px';
    loupe.classList.add('show');
    const ctx = loupe.getContext('2d')!;
    const zoomSrc = 60 * (W / 1600 > 1 ? W / 1600 : 1) * Math.max(1, k / 2);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 220, 220);
    ctx.drawImage(src, at.x - zoomSrc / 2, at.y - zoomSrc / 2, zoomSrc, zoomSrc, 0, 0, 220, 220);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(110, 80); ctx.lineTo(110, 140);
    ctx.moveTo(80, 110); ctx.lineTo(140, 110);
    ctx.stroke();
  }

  const ro = new ResizeObserver(layout);
  ro.observe(stage);
  requestAnimationFrame(layout);
  return { el, destroy: () => ro.disconnect() };
}
