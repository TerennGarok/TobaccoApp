// Perspective correction and lighting/colour enhancement for scanned pages.
import { Quad, dist, homography } from './geometry';

export type FilterKind = 'enhanced' | 'color' | 'gray' | 'bw' | 'original';

export const FILTERS: { id: FilterKind; label: string }[] = [
  { id: 'enhanced', label: 'Auto' },
  { id: 'color', label: 'Color' },
  { id: 'gray', label: 'Grayscale' },
  { id: 'bw', label: 'B & W' },
  { id: 'original', label: 'Original' },
];

export interface Adjust {
  brightness: number; // -100..100
  contrast: number; // -100..100
}

function getData(c: HTMLCanvasElement | OffscreenCanvas | ImageBitmap | HTMLImageElement, w: number, h: number) {
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(c as CanvasImageSource, 0, 0);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Output size for the rectified page. Uses the Zhang & He (whiteboard scanning) method to
 * recover the true aspect ratio from the perspective quad, assuming the optical centre is
 * the image centre; falls back to averaged side lengths when the estimate is unreliable.
 */
export function targetSize(q: Quad, maxDim = 3000, imgW?: number, imgH?: number): { w: number; h: number } {
  const wTop = dist(q[0], q[1]), wBot = dist(q[3], q[2]);
  const hL = dist(q[0], q[3]), hR = dist(q[1], q[2]);
  let w = Math.max(wTop, wBot), h = Math.max(hL, hR);
  let ratio = (wTop + wBot) / Math.max(1, hL + hR); // fallback
  if (imgW && imgH) {
    const r = perspectiveAspect(q, imgW / 2, imgH / 2);
    if (r && isFinite(r) && r > 0.1 && r < 10 && Math.abs(Math.log(r / ratio)) < 0.6) ratio = r;
  }
  // keep the larger measured dimension, derive the other from the ratio
  if (w / h > ratio) w = h * ratio;
  else h = w / ratio;
  const s = Math.min(1, maxDim / Math.max(w, h));
  return { w: Math.max(16, Math.round(w * s)), h: Math.max(16, Math.round(h * s)) };
}

function perspectiveAspect(q: Quad, u0: number, v0: number): number | null {
  const m = (p: { x: number; y: number }) => [p.x - u0, p.y - v0, 1];
  const m1 = m(q[0]), m2 = m(q[1]), m3 = m(q[3]), m4 = m(q[2]); // TL, TR, BL, BR
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3);
  const k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2);
  const n2 = m2.map((v, i) => k2 * v - m1[i]);
  const n3 = m3.map((v, i) => k3 * v - m1[i]);
  if (Math.abs(n2[2]) < 1e-6 || Math.abs(n3[2]) < 1e-6) {
    // affine case: no perspective, use direct lengths
    return Math.sqrt((n2[0] ** 2 + n2[1] ** 2) / (n3[0] ** 2 + n3[1] ** 2));
  }
  const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
  if (!(f2 > 0)) return Math.sqrt((n2[0] ** 2 + n2[1] ** 2) / (n3[0] ** 2 + n3[1] ** 2));
  return Math.sqrt((n2[0] ** 2 / f2 + n2[1] ** 2 / f2 + n2[2] ** 2) / (n3[0] ** 2 / f2 + n3[1] ** 2 / f2 + n3[2] ** 2));
}

/** Rectify the quadrilateral region of `src` into an upright w×h canvas (bilinear sampling). */
export function warpPerspective(src: CanvasImageSource & { width: number; height: number }, srcW: number, srcH: number, q: Quad, maxDim = 3000): HTMLCanvasElement {
  const { w, h } = targetSize(q, maxDim, srcW, srcH);
  const sd = getData(src as any, srcW, srcH);
  const s = sd.data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  const od = octx.createImageData(w, h);
  const o = od.data;
  // Map destination -> source
  const H = homography(
    [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
    q,
  );
  const [a, b, c, d, e, f, g, hh] = H;
  const maxX = srcW - 1, maxY = srcH - 1;
  let oi = 0;
  for (let y = 0; y < h; y++) {
    const yy = y + 0.5;
    for (let x = 0; x < w; x++, oi += 4) {
      const xx = x + 0.5;
      const den = g * xx + hh * yy + 1;
      let sx = (a * xx + b * yy + c) / den - 0.5;
      let sy = (d * xx + e * yy + f) / den - 0.5;
      if (sx < 0) sx = 0; else if (sx > maxX) sx = maxX;
      if (sy < 0) sy = 0; else if (sy > maxY) sy = maxY;
      const x0 = sx | 0, y0 = sy | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0, y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * srcW + x0) * 4, i10 = (y0 * srcW + x1) * 4, i01 = (y1 * srcW + x0) * 4, i11 = (y1 * srcW + x1) * 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      o[oi] = s[i00] * w00 + s[i10] * w10 + s[i01] * w01 + s[i11] * w11;
      o[oi + 1] = s[i00 + 1] * w00 + s[i10 + 1] * w10 + s[i01 + 1] * w01 + s[i11 + 1] * w11;
      o[oi + 2] = s[i00 + 2] * w00 + s[i10 + 2] * w10 + s[i01 + 2] * w01 + s[i11 + 2] * w11;
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

export function rotateCanvas(src: HTMLCanvasElement, quarterTurns: number): HTMLCanvasElement {
  const t = ((quarterTurns % 4) + 4) % 4;
  if (t === 0) return src;
  const c = document.createElement('canvas');
  c.width = t % 2 ? src.height : src.width;
  c.height = t % 2 ? src.width : src.height;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((t * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// ---------- Illumination estimation ----------

/**
 * Estimate the smooth "paper" illumination for each channel.
 * Downsamples, applies a max filter (removes dark ink), then heavy blur,
 * then upsamples with bilinear interpolation back to full size.
 */
function estimateBackground(src: HTMLCanvasElement): Uint8ClampedArray {
  const W = src.width, H = src.height;
  const small = 160;
  const s = Math.min(1, small / Math.max(W, H));
  const sw = Math.max(4, Math.round(W * s)), sh = Math.max(4, Math.round(H * s));
  const sc = document.createElement('canvas');
  sc.width = sw;
  sc.height = sh;
  const sctx = sc.getContext('2d', { willReadFrequently: true })!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, sw, sh);
  const id = sctx.getImageData(0, 0, sw, sh);
  const d = id.data;
  const r = Math.max(2, Math.round(Math.max(sw, sh) / 40));
  for (let ch = 0; ch < 3; ch++) {
    let plane = new Float32Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) plane[i] = d[i * 4 + ch];
    plane = maxFilter(plane, sw, sh, r);
    plane = boxBlur(plane, sw, sh, r * 2);
    plane = boxBlur(plane, sw, sh, r * 2);
    for (let i = 0; i < sw * sh; i++) d[i * 4 + ch] = plane[i];
  }
  sctx.putImageData(id, 0, 0);
  const big = document.createElement('canvas');
  big.width = W;
  big.height = H;
  const bctx = big.getContext('2d', { willReadFrequently: true })!;
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(sc, 0, 0, W, H);
  return bctx.getImageData(0, 0, W, H).data;
}

function maxFilter(p: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) m = Math.max(m, p[y * w + i]);
      tmp[y * w + x] = m;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let i = Math.max(0, y - r); i <= Math.min(h - 1, y + r); i++) m = Math.max(m, tmp[i * w + x]);
      out[y * w + x] = m;
    }
  return out;
}

function boxBlur(p: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) {
        s += p[y * w + i];
        c++;
      }
      tmp[y * w + x] = s / c;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let i = Math.max(0, y - r); i <= Math.min(h - 1, y + r); i++) {
        s += tmp[i * w + x];
        c++;
      }
      out[y * w + x] = s / c;
    }
  return out;
}

function percentileLum(d: Uint8ClampedArray, p: number): number {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < d.length; i += 16) {
    hist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++;
    n++;
  }
  const target = n * p;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return 255;
}

/** Apply a scan filter + brightness/contrast. Returns a new canvas. */
export function applyFilter(src: HTMLCanvasElement, kind: FilterKind, adj: Adjust = { brightness: 0, contrast: 0 }): HTMLCanvasElement {
  const W = src.width, H = src.height;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  const N = W * H;

  if (kind === 'enhanced' || kind === 'gray' || kind === 'bw') {
    // Flatten uneven lighting / shadows / gradients by dividing by the estimated paper illumination.
    const bg = estimateBackground(src);
    for (let i = 0; i < N * 4; i += 4) {
      for (let c = 0; c < 3; c++) {
        const b = Math.max(24, bg[i + c]);
        const v = (d[i + c] / b) * 255;
        d[i + c] = v > 255 ? 255 : v;
      }
    }
  }

  if (kind === 'enhanced' || kind === 'color') {
    // Levels: stretch so ink is dark and paper is white; slight saturation boost.
    const lo = percentileLum(d, 0.01);
    const hi = kind === 'color' ? Math.max(lo + 40, percentileLum(d, 0.97)) : 245;
    const scale = 255 / Math.max(1, hi - lo);
    const satBoost = kind === 'enhanced' ? 1.25 : 1.1;
    for (let i = 0; i < N * 4; i += 4) {
      let r = (d[i] - lo) * scale, g = (d[i + 1] - lo) * scale, b = (d[i + 2] - lo) * scale;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * satBoost;
      g = l + (g - l) * satBoost;
      b = l + (b - l) * satBoost;
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  } else if (kind === 'gray') {
    const lo = percentileLum(d, 0.01);
    const scale = 255 / Math.max(1, 245 - lo);
    for (let i = 0; i < N * 4; i += 4) {
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] - lo) * scale;
      d[i] = d[i + 1] = d[i + 2] = l;
    }
  } else if (kind === 'bw') {
    // Adaptive threshold on the flattened luminance using an integral image.
    const L = new Float32Array(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    const integ = new Float64Array((W + 1) * (H + 1));
    for (let y = 1; y <= H; y++) {
      let rs = 0;
      for (let x = 1; x <= W; x++) {
        rs += L[(y - 1) * W + x - 1];
        integ[y * (W + 1) + x] = integ[(y - 1) * (W + 1) + x] + rs;
      }
    }
    const r = Math.max(8, Math.round(Math.max(W, H) / 50));
    const C = 0.86 + adj.contrast / 1000;
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const area = (x1 - x0) * (y1 - y0);
        const sum = integ[y1 * (W + 1) + x1] - integ[y0 * (W + 1) + x1] - integ[y1 * (W + 1) + x0] + integ[y0 * (W + 1) + x0];
        const mean = sum / area;
        const v = L[y * W + x];
        const thr = Math.min(mean * C, 215) + adj.brightness * 0.6;
        const o = v < thr ? 0 : 255;
        const j = (y * W + x) * 4;
        d[j] = d[j + 1] = d[j + 2] = o;
      }
    }
  }

  if (kind !== 'bw' && (adj.brightness || adj.contrast)) {
    const c = adj.contrast * 1.28;
    const cf = (259 * (c + 255)) / (255 * (259 - c));
    const b = adj.brightness * 1.28;
    for (let i = 0; i < N * 4; i += 4) {
      d[i] = (d[i] - 128) * cf + 128 + b;
      d[i + 1] = (d[i + 1] - 128) * cf + 128 + b;
      d[i + 2] = (d[i + 2] - 128) * cf + 128 + b;
    }
  }
  ctx.putImageData(id, 0, 0);
  return out;
}

export function downscale(src: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const s = Math.min(1, maxDim / Math.max(src.width, src.height));
  if (s === 1) return src;
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * s);
  c.height = Math.round(src.height * s);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Decode an image file (applies EXIF orientation) into a canvas, capped to maxDim. */
export async function fileToCanvas(file: Blob, maxDim = 4096): Promise<HTMLCanvasElement> {
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
  } catch {
    bmp = await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('This image format is not supported by your browser.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = (bmp as any).naturalWidth || bmp.width, h = (bmp as any).naturalHeight || bmp.height;
  const s = Math.min(1, maxDim / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, c.width, c.height);
  if ('close' in bmp) (bmp as ImageBitmap).close();
  return c;
}
