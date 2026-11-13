// Page organizer: reorder, rotate, delete, duplicate, extract and insert pages (blank, files, scans).
import { PDFDocument, degrees } from 'pdf-lib';
import { h, icon, sheet, toast, busy, choose, confirmDlg, pickFiles, clear, promptDlg } from '../ui';
import { loadPdfLib, renderPageToCanvas, PDFDocumentProxy } from '../pdf';
import { appendFiles, IMPORT_ACCEPT } from '../convert';

export interface OrganizerCtx {
  bytes(): Uint8Array;
  pdf(): PDFDocumentProxy;
  apply(bytes: Uint8Array, msg?: string): Promise<void>;
  scan(mode: 'camera' | 'photos', onBytes: (b: Uint8Array) => Promise<void>): void;
  scrollTo(i: number): void;
  extract(bytes: Uint8Array, name: string): Promise<void>;
}

export function openOrganizer(ctx: OrganizerCtx) {
  const sel = new Set<number>();
  const grid = h('div', { class: 'thumb-grid organizer' });
  const countEl = h('span', { class: 'sel-count' });
  let thumbs: string[] = [];

  const actions = h('div', { class: 'org-actions' },
    btn('rotl', 'Left', () => rotate(-90)),
    btn('rotr', 'Right', () => rotate(90)),
    btn('left', 'Earlier', () => move(-1)),
    btn('right', 'Later', () => move(1)),
    btn('copy', 'Duplicate', () => duplicate()),
    btn('files', 'Extract', () => extract()),
    btn('trash', 'Delete', () => del(), 'danger'),
  );
  const s = sheet('Pages', [
    h('div', { class: 'org-head' },
      countEl,
      h('button', { class: 'btn small', onclick: () => { if (sel.size === ctx.pdf().numPages) sel.clear(); else for (let i = 0; i < ctx.pdf().numPages; i++) sel.add(i); refreshSel(); } }, 'Select all'),
      h('button', { class: 'btn small primary', onclick: () => insertMenu() }, icon('plus', 16), 'Insert'),
    ),
    grid,
    actions,
  ], { full: true });

  function btn(ic: string, label: string, fn: () => void, cls = '') {
    return h('button', { class: 'tool-btn ' + cls, onclick: () => (sel.size ? fn() : toast('Select one or more pages first')) }, icon(ic), h('span', null, label));
  }

  async function renderThumbs() {
    const pdf = ctx.pdf();
    clear(grid);
    thumbs = new Array(pdf.numPages).fill('');
    const items: HTMLElement[] = [];
    for (let i = 0; i < pdf.numPages; i++) {
      const img = h('img', { alt: `Page ${i + 1}` });
      const item = h('button', { class: 'thumb', onclick: () => { sel.has(i) ? sel.delete(i) : sel.add(i); refreshSel(); } },
        img, h('span', { class: 'thumb-num' }, String(i + 1)), h('span', { class: 'thumb-check' }, icon('check', 16)));
      item.addEventListener('dblclick', () => { s.close(); ctx.scrollTo(i); });
      items.push(item);
      grid.appendChild(item);
    }
    refreshSel();
    for (let i = 0; i < pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i + 1);
        const vp = page.getViewport({ scale: 1 });
        const c = await renderPageToCanvas(page, 220 / Math.max(vp.width, vp.height));
        thumbs[i] = c.toDataURL('image/jpeg', 0.7);
        (items[i].querySelector('img') as HTMLImageElement).src = thumbs[i];
      } catch { /* ignore */ }
    }
  }

  function refreshSel() {
    Array.from(grid.children).forEach((c, i) => c.classList.toggle('selected', sel.has(i)));
    countEl.textContent = sel.size ? `${sel.size} selected` : `${ctx.pdf().numPages} pages — tap to select`;
  }

  async function mutate(fn: (doc: PDFDocument) => Promise<void> | void, msg: string, nextSel?: number[]) {
    const b = busy('Updating pages…');
    try {
      const doc = await loadPdfLib(ctx.bytes());
      await fn(doc);
      const out = await doc.save();
      b.done();
      await ctx.apply(out, msg);
      sel.clear();
      nextSel?.forEach((i) => sel.add(i));
      await renderThumbs();
    } catch (e: any) {
      b.done();
      console.error(e);
      toast('Failed: ' + (e?.message || e));
    }
  }

  const sorted = () => [...sel].sort((a, b) => a - b);

  function rotate(d: number) {
    const idx = sorted();
    mutate((doc) => {
      idx.forEach((i) => {
        const p = doc.getPage(i);
        p.setRotation(degrees((((p.getRotation().angle + d) % 360) + 360) % 360));
      });
    }, 'Rotated', idx);
  }

  function reorder(doc: PDFDocument, order: number[]) {
    const pages = doc.getPages();
    for (let i = pages.length - 1; i >= 0; i--) doc.removePage(i);
    order.forEach((k) => doc.addPage(pages[k]));
  }

  function move(d: number) {
    const n = ctx.pdf().numPages;
    const idx = sorted();
    const order = [...Array(n).keys()];
    if (d < 0) {
      if (idx[0] === 0) return;
      for (const i of idx) [order[i - 1], order[i]] = [order[i], order[i - 1]];
    } else {
      if (idx[idx.length - 1] === n - 1) return;
      for (const i of [...idx].reverse()) [order[i + 1], order[i]] = [order[i], order[i + 1]];
    }
    mutate((doc) => reorder(doc, order), 'Moved', idx.map((i) => i + d));
  }

  function duplicate() {
    const idx = sorted();
    mutate(async (doc) => {
      const copies = await doc.copyPages(doc, idx);
      idx.forEach((i, k) => doc.insertPage(i + k + 1, copies[k]));
    }, 'Duplicated');
  }

  async function del() {
    const idx = sorted();
    if (idx.length >= ctx.pdf().numPages) return toast('A document needs at least one page');
    if (!(await confirmDlg('Delete pages?', `Delete ${idx.length} page(s)? You can't undo this.`, 'Delete', true))) return;
    mutate((doc) => { [...idx].reverse().forEach((i) => doc.removePage(i)); }, 'Deleted');
  }

  async function extract() {
    const idx = sorted();
    const name = await promptDlg('Name for the new document', `Pages ${idx.map((i) => i + 1).join(', ')}`);
    if (!name) return;
    const b = busy('Extracting…');
    try {
      const src = await loadPdfLib(ctx.bytes());
      const out = await PDFDocument.create();
      (await out.copyPages(src, idx)).forEach((p) => out.addPage(p));
      const bytes = await out.save();
      b.done();
      await ctx.extract(bytes, name);
    } catch (e: any) {
      b.done();
      toast('Failed: ' + e?.message);
    }
  }

  function insertPos() {
    return sel.size ? Math.max(...sel) + 1 : ctx.pdf().numPages;
  }

  async function insertBytes(newBytes: Uint8Array, at: number) {
    await mutate(async (doc) => {
      const src = await PDFDocument.load(newBytes, { ignoreEncryption: true });
      const pages = await doc.copyPages(src, src.getPageIndices());
      pages.forEach((p, k) => doc.insertPage(at + k, p));
    }, 'Pages inserted');
  }

  async function insertMenu() {
    const at = insertPos();
    const c = await choose(`Insert at position ${at + 1}`, [
      { label: 'Scan with camera', value: 'camera', icon: 'camera' },
      { label: 'Scan from photos', value: 'photos', icon: 'image', desc: 'With crop & enhancement' },
      { label: 'Files (PDF, images, Word, text…)', value: 'files', icon: 'files' },
      { label: 'Blank page', value: 'blank', icon: 'file' },
    ]);
    if (!c) return;
    if (c === 'blank') {
      mutate((doc) => {
        const ref = doc.getPage(Math.max(0, at - 1));
        const { width, height } = ref.getSize();
        doc.insertPage(at, [width, height]);
      }, 'Blank page added');
    } else if (c === 'files') {
      const files = await pickFiles(IMPORT_ACCEPT, true);
      if (!files.length) return;
      const b = busy('Converting…');
      try {
        const tmp = await PDFDocument.create();
        await appendFiles(tmp, files, (localStorage.getItem('importPageSize') as any) || 'letter', (m) => b.update(m));
        const nb = await tmp.save();
        b.done();
        await insertBytes(nb, at);
      } catch (e: any) {
        b.done();
        toast(e?.message || 'Could not convert file');
      }
    } else {
      s.close();
      ctx.scan(c as 'camera' | 'photos', async (scanBytes) => {
        await insertBytes(scanBytes, at);
      });
    }
  }

  renderThumbs();
}
