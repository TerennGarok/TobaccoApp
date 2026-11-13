// Signature / initials pad with saved signatures (stored on-device).
import { h, sheet, icon, clear } from '../ui';

const KEY = 'savedSignatures';

export function savedSignatures(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}
function setSaved(list: string[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8)));
}

/** Resolves to a transparent PNG data URL (trimmed), or null. */
export function getSignature(): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => {
      done = true;
      s.close();
      resolve(v);
    };
    const savedWrap = h('div', { class: 'sig-saved' });
    const renderSaved = () => {
      clear(savedWrap);
      const list = savedSignatures();
      if (!list.length) return;
      savedWrap.appendChild(h('div', { class: 'label' }, 'Saved'));
      const row = h('div', { class: 'sig-saved-row' });
      list.forEach((src, i) => {
        row.appendChild(
          h('div', { class: 'sig-item' },
            h('button', { class: 'sig-pick', onclick: () => finish(src) }, h('img', { src, alt: 'Saved signature' })),
            h('button', { class: 'sig-del', 'aria-label': 'Delete', onclick: () => { const l = savedSignatures(); l.splice(i, 1); setSaved(l); renderSaved(); } }, icon('x', 14)),
          ),
        );
      });
      savedWrap.appendChild(row);
    };
    renderSaved();

    const pad = h('canvas', { class: 'sig-pad' });
    let color = '#111827';
    const colors = ['#111827', '#1d4ed8', '#b91c1c'];
    const colorRow = h('div', { class: 'swatches' }, colors.map((c) => {
      const b = h('button', { class: 'swatch' + (c === color ? ' on' : ''), style: { background: c }, 'aria-label': 'Ink color', onclick: () => {
        color = c;
        colorRow.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      } });
      return b;
    }));
    const keep = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
    keep.checked = true;
    let strokes = 0;
    const s = sheet('Signature', [
      savedWrap,
      h('div', { class: 'label' }, 'Draw your signature'),
      pad,
      h('div', { class: 'sig-tools' }, colorRow, h('button', { class: 'btn small', onclick: () => { const c = pad.getContext('2d')!; c.clearRect(0, 0, pad.width, pad.height); strokes = 0; } }, 'Clear')),
      h('label', { class: 'check-row' }, keep, h('span', null, 'Save for later')),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: () => finish(null) }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => {
          if (!strokes) return finish(null);
          const url = trim(pad);
          if (keep.checked) setSaved([url, ...savedSignatures()]);
          finish(url);
        } }, 'Use signature'),
      ),
    ], { onClose: () => !done && resolve(null) });

    requestAnimationFrame(() => {
      const r = pad.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      pad.width = Math.round(r.width * dpr);
      pad.height = Math.round(r.height * dpr);
      const ctx = pad.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      let last: { x: number; y: number; t: number } | null = null;
      let lw = 2.6;
      pad.addEventListener('pointerdown', (e) => {
        pad.setPointerCapture(e.pointerId);
        const b = pad.getBoundingClientRect();
        last = { x: e.clientX - b.left, y: e.clientY - b.top, t: performance.now() };
        strokes++;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(last.x, last.y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      });
      pad.addEventListener('pointermove', (e) => {
        if (!last) return;
        const b = pad.getBoundingClientRect();
        const p = { x: e.clientX - b.left, y: e.clientY - b.top, t: performance.now() };
        const v = Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, p.t - last.t);
        const target = Math.max(1.2, Math.min(3.6, 3.6 - v * 1.4));
        lw = lw * 0.6 + target * 0.4;
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last = p;
      });
      const up = () => (last = null);
      pad.addEventListener('pointerup', up);
      pad.addEventListener('pointercancel', up);
    });
  });
}

function trim(c: HTMLCanvasElement): string {
  const ctx = c.getContext('2d')!;
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < x0) return c.toDataURL('image/png');
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
