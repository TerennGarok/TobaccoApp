// Tiny DOM + UI helpers (no framework).

type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, any> | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') (el as any)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// ---------- Icons (stroke icons, 24x24) ----------
const ICONS: Record<string, string> = {
  back: 'M15 18l-6-6 6-6',
  camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  image: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  files: 'M15 2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z M15 2v5h5 M4 7v13a2 2 0 0 0 2 2h10',
  plus: 'M12 5v14 M5 12h14',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
  more: 'M12 6h.01 M12 12h.01 M12 18h.01',
  pen: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  highlighter: 'M9 11l-6 6v3h9l3-3 M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
  text: 'M4 7V4h16v3 M9 20h6 M12 4v16',
  square: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  circle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  line: 'M5 19L19 5',
  arrow: 'M5 19L19 5 M9 5h10v10',
  eraser: 'M7 21l-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21 M22 21H7 M5 11l9 9',
  hand: 'M18 11V6a2 2 0 0 0-4 0v5 M14 10V4a2 2 0 0 0-4 0v6 M10 10.5V6a2 2 0 0 0-4 0v8 M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
  pointer: 'M3 3l7 18 2.5-7.5L20 11z',
  undo: 'M3 7v6h6 M21 17a9 9 0 0 0-15-6.7L3 13',
  redo: 'M21 7v6h-6 M3 17a9 9 0 0 1 15-6.7L21 13',
  rotl: 'M2.5 2v6h6 M2.7 15.5a9 9 0 1 0 2.1-9.4L2.5 8',
  rotr: 'M21.5 2v6h-6 M21.3 15.5a9 9 0 1 1-2.1-9.4l2.3 1.9',
  trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  copy: 'M8 8h12v12H8z M16 8V4H4v12h4',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  zoomin: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3 M11 8v6 M8 11h6',
  zoomout: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3 M8 11h6',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18 M6 6l12 12',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M7 12h10',
  pages: 'M12 2L2 7l10 5 10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  sign: 'M3 17c3-3 4-9 6-9s-1 9 2 9 3-5 5-5 1 4 3 4 M3 21h18',
  flash: 'M13 2L3 14h9l-1 8 10-12h-9z',
  type: 'M17 6.1H3 M21 12.1H3 M15.1 18H3',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z',
  form: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  ocr: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M8 8h8 M12 8v8',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14 M18 22V8a2 2 0 0 0-2-2H2',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  wand: 'M15 4V2 M15 16v-2 M8 9h2 M20 9h2 M17.8 11.8L19 13 M15 9h0 M17.8 6.2L19 5 M3 21l9-9 M12.2 6.2L11 5',
  whiteout: 'M3 5h18v14H3z M7 9h10 M7 13h6',
  stamp: 'M5 22h14 M19.3 14H4.7a1.7 1.7 0 0 0-1.7 1.7V18h18v-2.3a1.7 1.7 0 0 0-1.7-1.7z M9 14V9.5a3 3 0 1 1 6 0V14',
  menu: 'M3 6h18 M3 12h18 M3 18h18',
  folder: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z',
  merge: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
  auto: 'M12 3a9 9 0 1 0 9 9 M21 3l-9 9 M15 3h6v6',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
};

export function icon(name: string, size = 22): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('icon');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.info);
  svg.appendChild(p);
  return svg;
}

export function iconBtn(name: string, title: string, onClick: (e: MouseEvent) => void, extra = ''): HTMLButtonElement {
  return h('button', { class: 'icon-btn ' + extra, title, 'aria-label': title, onclick: onClick }, icon(name));
}

export function toolBtn(name: string, label: string, onClick: (e: MouseEvent) => void, extra = ''): HTMLButtonElement {
  return h('button', { class: 'tool-btn ' + extra, title: label, onclick: onClick }, icon(name), h('span', null, label));
}

// ---------- Toast ----------
let toastTimer: any;
export function toast(msg: string, ms = 2600) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el!.classList.remove('show'), ms);
}

// ---------- Busy overlay ----------
let busyCount = 0;
export function busy(msg = 'Working…'): { update(msg: string): void; done(): void } {
  let el = document.getElementById('busy');
  if (!el) {
    el = h('div', { id: 'busy' }, h('div', { class: 'busy-box' }, h('div', { class: 'spinner' }), h('div', { class: 'busy-msg' })));
    document.body.appendChild(el);
  }
  busyCount++;
  const msgEl = el.querySelector('.busy-msg')!;
  msgEl.textContent = msg;
  el.classList.add('show');
  let finished = false;
  return {
    update(m: string) {
      msgEl.textContent = m;
    },
    done() {
      if (finished) return;
      finished = true;
      busyCount = Math.max(0, busyCount - 1);
      if (busyCount === 0) el!.classList.remove('show');
    },
  };
}

/** Let the browser paint (e.g. to show a spinner before heavy sync work). */
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ---------- Modal / bottom sheet ----------
export interface SheetHandle {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
}

export function sheet(title: string, content: Child, opts: { onClose?: () => void; full?: boolean } = {}): SheetHandle {
  const body = h('div', { class: 'sheet-body' }, content);
  const panel = h(
    'div',
    { class: 'sheet' + (opts.full ? ' full' : ''), role: 'dialog', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-title' }, title), iconBtn('x', 'Close', () => close())),
    body,
  );
  const backdrop = h('div', { class: 'backdrop', onclick: (e: MouseEvent) => e.target === backdrop && close() }, panel);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 200);
    opts.onClose?.();
  }
  return { el: panel, body, close };
}

export interface Choice<T> {
  label: string;
  value: T;
  icon?: string;
  desc?: string;
  danger?: boolean;
}

export function choose<T>(title: string, choices: Choice<T>[], message?: string): Promise<T | null> {
  return new Promise((resolve) => {
    let picked = false;
    const s = sheet(
      title,
      [
        message ? h('p', { class: 'sheet-msg' }, message) : null,
        h(
          'div',
          { class: 'menu-list' },
          choices.map((c) =>
            h(
              'button',
              {
                class: 'menu-item' + (c.danger ? ' danger' : ''),
                onclick: () => {
                  picked = true;
                  s.close();
                  resolve(c.value);
                },
              },
              c.icon ? icon(c.icon) : null,
              h('div', { class: 'menu-text' }, h('div', null, c.label), c.desc ? h('small', null, c.desc) : null),
            ),
          ),
        ),
      ],
      { onClose: () => !picked && resolve(null) },
    );
  });
}

export function confirmDlg(title: string, message: string, okLabel = 'OK', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet(
      title,
      [
        h('p', { class: 'sheet-msg' }, message),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn', onclick: () => s.close() }, 'Cancel'),
          h(
            'button',
            {
              class: 'btn ' + (danger ? 'danger' : 'primary'),
              onclick: () => {
                done = true;
                s.close();
                resolve(true);
              },
            },
            okLabel,
          ),
        ),
      ],
      { onClose: () => !done && resolve(false) },
    );
  });
}

export function promptDlg(title: string, value = '', opts: { multiline?: boolean; placeholder?: string; okLabel?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const input = opts.multiline
      ? h('textarea', { class: 'field', rows: 5, placeholder: opts.placeholder || '' })
      : h('input', { class: 'field', type: 'text', placeholder: opts.placeholder || '' });
    input.value = value;
    const ok = () => {
      done = true;
      s.close();
      resolve(input.value);
    };
    if (!opts.multiline) input.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') ok();
    });
    const s = sheet(
      title,
      [input, h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => s.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: ok }, opts.okLabel || 'OK'))],
      { onClose: () => !done && resolve(null) },
    );
    setTimeout(() => {
      input.focus();
      if (input instanceof HTMLInputElement) input.select();
    }, 150);
  });
}

// ---------- File picking ----------
export function pickFiles(accept: string, multiple = true, capture?: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    if (capture) input.setAttribute('capture', capture);
    let settled = false;
    input.addEventListener('change', () => {
      settled = true;
      resolve(Array.from(input.files || []));
      input.remove();
    });
    // Some browsers fire 'cancel'
    input.addEventListener('cancel', () => {
      if (!settled) resolve([]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

// ---------- Downloads & sharing ----------
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 4000);
}

export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav: any = navigator;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
  }
  downloadBlob(blob, filename);
}

export function safeFilename(name: string, ext = '.pdf') {
  const base = (name || 'document').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
  return base.toLowerCase().endsWith(ext) ? base : base + ext;
}

export function formatBytes(n: number) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

export function formatDate(t: number) {
  const d = new Date(t);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
