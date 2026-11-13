// Document boundary detection — pure JS, no OpenCV.
//
// Strategy: produce several candidate document regions (edge-enclosed region,
// bright Otsu region, low-saturation "paper" region), turn each into a
// quadrilateral (convex hull -> max-area quad -> least-squares side refinement)
// and score each quad by how well its sides sit on real image edges.

import { Pt, Quad, convexHull, polyArea, orderQuad, isConvex, lineIntersect, dist } from './geometry';

interface Gray {
  w: number;
  h: number;
  d: Float32Array;
}

const work = document.createElement('canvas');

export function detectDocument(src: CanvasImageSource, sw: number, sh: number, maxDim = 360): Quad | null {
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(8, Math.round(sw * scale));
  const h = Math.max(8, Math.round(sh * scale));
  work.width = w;
  work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h).data;
  const q = detectFromRGBA(img, w, h);
  if (!q) return null;
  return q.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;
}

export function detectFromRGBA(rgba: Uint8ClampedArray, w: number, h: number): Quad | null {
  const n = w * h;
  const gray = new Float32Array(n);
  const sat = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat[i] = mx - mn;
  }
  let G: Gray = { w, h, d: gray };
  G = blur(blur(G));

  // --- edges (Canny-ish) ---
  const { mag, edges } = canny(G);
  const edgeD = dilate(edges, w, h, 1);

  const candidates: Pt[][] = [];

  // A: regions enclosed by edges (not reachable from the image border).
  {
    const barrier = dilate(edges, w, h, 1);
    const outside = floodFromBorder(barrier, w, h);
    const inner = new Uint8Array(n);
    for (let i = 0; i < n; i++) inner[i] = !barrier[i] && !outside[i] ? 1 : 0;
    const comp = largestComponent(inner, w, h);
    if (comp) candidates.push(comp);
  }
  // B: bright region via Otsu threshold.
  {
    const t = otsu(G.d);
    const bin = new Uint8Array(n);
    for (let i = 0; i < n; i++) bin[i] = G.d[i] > t ? 1 : 0;
    const closed = erode(dilate(bin, w, h, 2), w, h, 2);
    const comp = largestComponent(closed, w, h);
    if (comp) candidates.push(comp);
  }
  // C: "paper-like" — bright and unsaturated.
  {
    const paper = new Float32Array(n);
    for (let i = 0; i < n; i++) paper[i] = G.d[i] - 1.5 * sat[i];
    const t = otsu(paper);
    const bin = new Uint8Array(n);
    for (let i = 0; i < n; i++) bin[i] = paper[i] > t ? 1 : 0;
    const closed = erode(dilate(bin, w, h, 2), w, h, 2);
    const comp = largestComponent(closed, w, h);
    if (comp) candidates.push(comp);
  }

  let best: Quad | null = null;
  let bestScore = -1;
  const imgArea = w * h;
  for (const boundary of candidates) {
    const q = quadFromBoundary(boundary, w, h);
    if (!q) continue;
    const area = polyArea(q) / imgArea;
    if (area < 0.12 || !isConvex(q)) continue;
    const support = edgeSupport(q, edgeD, w, h);
    const ang = angleScore(q);
    const areaScore = area > 0.97 ? 0.3 : Math.min(1, area / 0.5);
    const score = support * 0.6 + ang * 0.2 + areaScore * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  void mag;
  if (!best || bestScore < 0.42) return null;
  return best;
}

// ---------------- image ops ----------------

function blur(g: Gray): Gray {
  const { w, h, d } = g;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const k = [1, 4, 6, 4, 1];
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0, ws = 0;
      for (let i = -2; i <= 2; i++) {
        const xx = x + i;
        if (xx < 0 || xx >= w) continue;
        s += d[row + xx] * k[i + 2];
        ws += k[i + 2];
      }
      tmp[row + x] = s / ws;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, ws = 0;
      for (let i = -2; i <= 2; i++) {
        const yy = y + i;
        if (yy < 0 || yy >= h) continue;
        s += tmp[yy * w + x] * k[i + 2];
        ws += k[i + 2];
      }
      out[y * w + x] = s / ws;
    }
  }
  return { w, h, d: out };
}

function canny(g: Gray) {
  const { w, h, d } = g;
  const n = w * h;
  const mag = new Float32Array(n);
  const dir = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -d[i - w - 1] - 2 * d[i - 1] - d[i + w - 1] + d[i - w + 1] + 2 * d[i + 1] + d[i + w + 1];
      const gy = -d[i - w - 1] - 2 * d[i - w] - d[i - w + 1] + d[i + w - 1] + 2 * d[i + w] + d[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
      let a = (Math.atan2(gy, gx) * 180) / Math.PI;
      if (a < 0) a += 180;
      dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }
  }
  const nms = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      let a = 0, b = 0;
      switch (dir[i]) {
        case 0: a = mag[i - 1]; b = mag[i + 1]; break;
        case 1: a = mag[i - w - 1]; b = mag[i + w + 1]; break;
        case 2: a = mag[i - w]; b = mag[i + w]; break;
        default: a = mag[i - w + 1]; b = mag[i + w - 1];
      }
      if (m >= a && m >= b) nms[i] = m;
    }
  }
  // thresholds from the distribution of suppressed magnitudes
  const vals: number[] = [];
  for (let i = 0; i < n; i += 2) if (nms[i] > 4) vals.push(nms[i]);
  vals.sort((a, b) => a - b);
  const hi = Math.max(30, vals.length ? vals[Math.floor(vals.length * 0.8)] : 60);
  const lo = hi * 0.4;
  const edges = new Uint8Array(n);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (nms[i] >= hi && !edges[i]) {
      edges[i] = 1;
      stack.push(i);
      while (stack.length) {
        const j = stack.pop()!;
        const jx = j % w, jy = (j / w) | 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = jx + dx, yy = jy + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const k = yy * w + xx;
            if (!edges[k] && nms[k] >= lo) {
              edges[k] = 1;
              stack.push(k);
            }
          }
      }
    }
  }
  return { mag, edges };
}

function dilate(bin: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // separable max filter
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r && !v; i++) {
        const xx = x + i;
        if (xx >= 0 && xx < w && bin[row + xx]) v = 1;
      }
      tmp[row + x] = v;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r && !v; i++) {
        const yy = y + i;
        if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1;
      }
      out[y * w + x] = v;
    }
  return out;
}

function erode(bin: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = bin[i] ? 0 : 1;
  const d = dilate(inv, w, h, r);
  for (let i = 0; i < d.length; i++) d[i] = d[i] ? 0 : 1;
  return d;
}

function floodFromBorder(barrier: Uint8Array, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!seen[i] && !barrier[i]) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  return seen;
}

/** Returns boundary pixels of the largest 4-connected component. */
function largestComponent(bin: Uint8Array, w: number, h: number): Pt[] | null {
  const n = w * h;
  const label = new Int32Array(n);
  let bestLabel = 0, bestSize = 0, cur = 0;
  const stack: number[] = [];
  for (let s = 0; s < n; s++) {
    if (!bin[s] || label[s]) continue;
    cur++;
    let size = 0;
    label[s] = cur;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && bin[i - 1] && !label[i - 1]) { label[i - 1] = cur; stack.push(i - 1); }
      if (x < w - 1 && bin[i + 1] && !label[i + 1]) { label[i + 1] = cur; stack.push(i + 1); }
      if (y > 0 && bin[i - w] && !label[i - w]) { label[i - w] = cur; stack.push(i - w); }
      if (y < h - 1 && bin[i + w] && !label[i + w]) { label[i + w] = cur; stack.push(i + w); }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = cur;
    }
  }
  if (!bestLabel || bestSize < n * 0.05) return null;
  const pts: Pt[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (label[i] !== bestLabel) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || label[i - 1] !== bestLabel || label[i + 1] !== bestLabel || label[i - w] !== bestLabel || label[i + w] !== bestLabel)
        pts.push({ x: x + 0.5, y: y + 0.5 });
    }
  return pts;
}

function otsu(d: Float32Array): number {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < d.length; i++) {
    if (d[i] < mn) mn = d[i];
    if (d[i] > mx) mx = d[i];
  }
  const bins = 256;
  const hist = new Float64Array(bins);
  const range = mx - mn || 1;
  for (let i = 0; i < d.length; i++) hist[Math.min(bins - 1, Math.floor(((d[i] - mn) / range) * bins))]++;
  const total = d.length;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 0;
  for (let i = 0; i < bins; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = i;
    }
  }
  return mn + ((thr + 0.5) / bins) * range;
}

// ---------------- quad fitting ----------------

function simplifyHull(hull: Pt[], maxPts: number): Pt[] {
  const pts = hull.slice();
  while (pts.length > maxPts) {
    let minA = Infinity, minI = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
      if (area < minA) {
        minA = area;
        minI = i;
      }
    }
    pts.splice(minI, 1);
  }
  return pts;
}

function maxAreaQuad(poly: Pt[]): Pt[] | null {
  const n = poly.length;
  if (n < 4) return null;
  let best = -1;
  let res: Pt[] | null = null;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const q = [poly[a], poly[b], poly[c], poly[d]];
          const ar = polyArea(q);
          if (ar > best) {
            best = ar;
            res = q;
          }
        }
  return res;
}

function quadFromBoundary(boundary: Pt[], w: number, h: number): Quad | null {
  if (boundary.length < 20) return null;
  const hull = convexHull(boundary);
  if (hull.length < 4) return null;
  const simple = simplifyHull(hull, 28);
  const raw = maxAreaQuad(simple);
  if (!raw) return null;
  let q = orderQuad(raw);
  q = refineQuad(q, boundary, w, h);
  return q;
}

/** Fit a line through boundary points near each side, then intersect neighbours. */
function refineQuad(q: Quad, pts: Pt[], w: number, h: number): Quad {
  const diag = Math.hypot(w, h);
  const tol = diag * 0.025;
  const lines: { p: Pt; d: Pt }[] = [];
  for (let s = 0; s < 4; s++) {
    const a = q[s], b = q[(s + 1) % 4];
    const len = dist(a, b) || 1;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const near: Pt[] = [];
    for (const p of pts) {
      const t = (p.x - a.x) * ux + (p.y - a.y) * uy;
      if (t < len * 0.1 || t > len * 0.9) continue;
      const dd = Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux);
      if (dd < tol) near.push(p);
    }
    if (near.length < 8) {
      lines.push({ p: a, d: { x: ux, y: uy } });
      continue;
    }
    // PCA line fit
    let mx = 0, my = 0;
    for (const p of near) {
      mx += p.x;
      my += p.y;
    }
    mx /= near.length;
    my /= near.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of near) {
      const dx = p.x - mx, dy = p.y - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let d = { x: Math.cos(theta), y: Math.sin(theta) };
    if (d.x * ux + d.y * uy < 0) d = { x: -d.x, y: -d.y };
    lines.push({ p: { x: mx, y: my }, d });
  }
  const out: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const prev = lines[(i + 3) % 4], cur = lines[i];
    const p = lineIntersect(prev.p, prev.d, cur.p, cur.d);
    if (!p || dist(p, q[i]) > diag * 0.12) out.push(q[i]);
    else out.push({ x: Math.min(w, Math.max(0, p.x)), y: Math.min(h, Math.max(0, p.y)) });
  }
  return out as Quad;
}

function edgeSupport(q: Quad, edges: Uint8Array, w: number, h: number): number {
  let total = 0;
  for (let s = 0; s < 4; s++) {
    const a = q[s], b = q[(s + 1) % 4];
    const N = 40;
    let hit = 0, cnt = 0;
    for (let i = 2; i < N - 2; i++) {
      const t = i / N;
      const x = Math.round(a.x + (b.x - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t);
      cnt++;
      // sides on the image border cannot be confirmed; treat as weak support
      if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) {
        hit += 0.35;
        continue;
      }
      let found = 0;
      for (let dy = -1; dy <= 1 && !found; dy++) for (let dx = -1; dx <= 1 && !found; dx++) if (edges[(y + dy) * w + x + dx]) found = 1;
      hit += found;
    }
    total += hit / cnt;
  }
  return total / 4;
}

function angleScore(q: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1);
    s += 1 - Math.min(1, Math.abs(cos) / 0.6);
  }
  return s / 4;
}
