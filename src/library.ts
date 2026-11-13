// Home screen: document library + entry points (scan, open, convert, merge).
import { PDFDocument } from 'pdf-lib';
import { h, icon, iconBtn, toast, busy, choose, confirmDlg, promptDlg, pickFiles, clear, uid, formatBytes, formatDate, shareOrDownload, safeFilename, downloadBlob } from './ui';
import { Screen, push, pop, replace } from './nav';
import { DocMeta, listDocs, getDocBytes, saveDoc, deleteDoc, updateMeta, requestPersistence } from './store';
import { makeThumb, loadPdfLib } from './pdf';
import { createScanSession } from './scanner/session';
import { filesToPdf, IMPORT_ACCEPT, fileKind } from './convert';
import { openEditor } from './editor/editor';

let listEl: HTMLElement;
let selectMode = false;
const selected = new Set<string>();
let selectBar: HTMLElement;

export async function createDocFromBytes(bytes: Uint8Array, name: string, open = true): Promise<DocMeta> {
  const now = Date.now();
  const meta: DocMeta = { id: uid(), name, createdAt: now, updatedAt: now, size: bytes.byteLength, pages: 0 };
  try {
    const t = await makeThumb(bytes);
    meta.thumb = t.thumb;
    meta.pages = t.pages;
  } catch {
    /* encrypted or unusual file — still store it */
  }
  await saveDoc(meta, bytes);
  requestPersistence();
  refresh();
  if (open) await openDoc(meta, bytes);
  return meta;
}

async function openDoc(meta: DocMeta, bytes?: Uint8Array) {
  const b = busy('Opening…');
  try {
    const data = bytes || (await getDocBytes(meta.id));
    if (!data) throw new Error('File missing');
    b.done();
    await openEditor(meta, data, {
      onSaved: () => refresh(),
      startScan: (mode, onBytes) => startScan(mode, onBytes, 'Insert pages'),
    });
  } catch (e: any) {
    b.done();
    toast('Could not open: ' + (e?.message || e));
  }
}

/** Launch a scan session. With onBytes, the result is handed back instead of saved as a new document. */
export function startScan(mode: 'camera' | 'photos', onBytes?: (b: Uint8Array) => Promise<void>, finishLabel?: string) {
  const session = createScanSession({
    start: mode,
    finishLabel,
    onExit: () => pop(),
    onComplete: async (bytes, name) => {
      if (onBytes) {
        await pop(true);
        await onBytes(bytes);
        return;
      }
      // Replace the scan screen with the editor for the new document.
      const now = Date.now();
      const meta: DocMeta = { id: uid(), name, createdAt: now, updatedAt: now, size: bytes.byteLength, pages: 0 };
      try {
        const t = await makeThumb(bytes);
        meta.thumb = t.thumb;
        meta.pages = t.pages;
      } catch { /* ignore */ }
      await saveDoc(meta, bytes);
      requestPersistence();
      refresh();
      await pop(true);
      toast(`Saved "${name}"`);
      await openDoc(meta, bytes);
    },
  });
  push(session);
}

async function importFiles(files: File[]) {
  if (!files.length) return;
  if (files.length === 1 && fileKind(files[0]) === 'pdf') {
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
      toast('That file does not look like a valid PDF');
      return;
    }
    await createDocFromBytes(bytes, files[0].name.replace(/\.pdf$/i, ''));
    return;
  }
  const unsupported = files.filter((f) => fileKind(f) === 'unknown');
  if (unsupported.length) toast(`Skipping unsupported: ${unsupported.map((f) => f.name).join(', ')}`, 3500);
  const ok = files.filter((f) => fileKind(f) !== 'unknown');
  if (!ok.length) return;
  let size = localStorage.getItem('importPageSize') || 'letter';
  if (ok.some((f) => fileKind(f) !== 'pdf')) {
    const s = await choose('Page size for converted files', [
      { label: 'US Letter', value: 'letter' },
      { label: 'A4', value: 'a4' },
      { label: 'US Legal', value: 'legal' },
    ]);
    if (!s) return;
    size = s;
    localStorage.setItem('importPageSize', s);
  }
  const b = busy('Converting…');
  try {
    const bytes = await filesToPdf(ok, size as any, (m) => b.update(m));
    b.done();
    const base = ok.length === 1 ? ok[0].name.replace(/\.[^.]+$/, '') : `Combined ${new Date().toLocaleDateString().replace(/\//g, '-')}`;
    await createDocFromBytes(bytes, base);
  } catch (e: any) {
    b.done();
    toast(e?.message || 'Conversion failed', 4000);
  }
}

async function docMenu(m: DocMeta) {
  const c = await choose(m.name, [
    { label: 'Open', value: 'open', icon: 'file' },
    { label: 'Share', value: 'share', icon: 'share' },
    { label: 'Download', value: 'download', icon: 'download' },
    { label: 'Rename', value: 'rename', icon: 'edit' },
    { label: 'Duplicate', value: 'dup', icon: 'copy' },
    { label: 'Select multiple (merge / delete)', value: 'select', icon: 'merge' },
    { label: 'Delete', value: 'delete', icon: 'trash', danger: true },
  ]);
  if (!c) return;
  if (c === 'open') return openDoc(m);
  if (c === 'select') {
    selectMode = true;
    selected.clear();
    selected.add(m.id);
    return refresh();
  }
  const bytes = await getDocBytes(m.id);
  if (!bytes) return toast('File missing');
  if (c === 'share') return shareOrDownload(new Blob([bytes], { type: 'application/pdf' }), safeFilename(m.name));
  if (c === 'download') return downloadBlob(new Blob([bytes], { type: 'application/pdf' }), safeFilename(m.name));
  if (c === 'rename') {
    const n = await promptDlg('Rename', m.name);
    if (n && n.trim()) {
      m.name = n.trim();
      await updateMeta(m);
      refresh();
    }
  }
  if (c === 'dup') await createDocFromBytes(bytes, m.name + ' (copy)', false);
  if (c === 'delete' && (await confirmDlg('Delete document?', `"${m.name}" will be permanently removed from this device.`, 'Delete', true))) {
    await deleteDoc(m.id);
    refresh();
  }
}

async function mergeSelected(docs: DocMeta[]) {
  const ids = docs.filter((d) => selected.has(d.id)).sort((a, b) => [...selected].indexOf(a.id) - [...selected].indexOf(b.id));
  if (ids.length < 2) return toast('Select at least two documents to merge');
  const name = await promptDlg('Name for the merged document', 'Merged document');
  if (!name) return;
  const b = busy('Merging…');
  try {
    const out = await PDFDocument.create();
    for (const d of ids) {
      const bytes = await getDocBytes(d.id);
      if (!bytes) continue;
      const src = await loadPdfLib(bytes);
      (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
    }
    const bytes = await out.save();
    b.done();
    selectMode = false;
    selected.clear();
    await createDocFromBytes(bytes, name);
  } catch (e: any) {
    b.done();
    toast('Merge failed: ' + e?.message);
  }
}

export async function refresh() {
  if (!listEl) return;
  const docs = await listDocs();
  clear(listEl);
  selectBar.classList.toggle('hidden', !selectMode);
  if (selectMode) {
    clear(selectBar);
    selectBar.append(
      h('span', null, `${selected.size} selected (in merge order)`),
      h('button', { class: 'btn small', onclick: () => { selectMode = false; selected.clear(); refresh(); } }, 'Cancel'),
      h('button', { class: 'btn small danger', onclick: async () => {
        if (!selected.size) return;
        if (!(await confirmDlg('Delete documents?', `Delete ${selected.size} document(s)?`, 'Delete', true))) return;
        for (const id of selected) await deleteDoc(id);
        selectMode = false; selected.clear(); refresh();
      } }, 'Delete'),
      h('button', { class: 'btn small primary', onclick: () => mergeSelected(docs) }, 'Merge'),
    );
  }
  if (!docs.length) {
    listEl.appendChild(
      h('div', { class: 'empty' },
        icon('file', 48),
        h('h3', null, 'No documents yet'),
        h('p', null, 'Scan a paper document with your camera, or open a PDF, photo or Word file.'),
      ),
    );
    return;
  }
  for (const d of docs) {
    const isSel = selected.has(d.id);
    const row = h('div', { class: 'doc-row' + (isSel ? ' selected' : '') },
      h('button', { class: 'doc-main', onclick: () => {
        if (selectMode) {
          isSel ? selected.delete(d.id) : selected.add(d.id);
          refresh();
        } else openDoc(d);
      } },
        h('div', { class: 'doc-thumb' }, d.thumb ? h('img', { src: d.thumb, alt: '' }) : icon('file', 28)),
        h('div', { class: 'doc-info' },
          h('div', { class: 'doc-name' }, d.name),
          h('div', { class: 'doc-sub' }, `${d.pages || '?'} page${d.pages === 1 ? '' : 's'} · ${formatBytes(d.size)} · ${formatDate(d.updatedAt)}`),
        ),
        selectMode ? h('span', { class: 'sel-mark' + (isSel ? ' on' : '') }, isSel ? String([...selected].indexOf(d.id) + 1) : '') : null,
      ),
      selectMode ? null : iconBtn('more', 'Options', () => docMenu(d)),
    );
    listEl.appendChild(row);
  }
}

export function homeScreen(): Screen {
  listEl = h('div', { class: 'doc-list' });
  selectBar = h('div', { class: 'select-bar hidden' });
  const action = (ic: string, title: string, sub: string, fn: () => void, primary = false) =>
    h('button', { class: 'action-card' + (primary ? ' primary' : ''), onclick: fn }, h('div', { class: 'action-icon' }, icon(ic, 26)), h('div', { class: 'action-text' }, h('b', null, title), h('small', null, sub)));

  const el = h('div', { class: 'home' },
    h('header', { class: 'home-head' },
      h('div', { class: 'brand' }, h('img', { src: './icons/icon.svg', alt: '', class: 'brand-logo' }), h('span', null, 'PocketPDF')),
      iconBtn('info', 'About', () => about()),
    ),
    h('div', { class: 'actions' },
      action('camera', 'Scan document', 'Camera · auto edges · multi-page', () => startScan('camera'), true),
      action('image', 'Scan from photos', 'Straighten & enhance pictures', () => startScan('photos')),
      action('folder', 'Open file', 'PDF, image, Word, text…', async () => importFiles(await pickFiles(IMPORT_ACCEPT, false))),
      action('merge', 'Combine files', 'Merge many files into one PDF', async () => importFiles(await pickFiles(IMPORT_ACCEPT, true))),
    ),
    h('div', { class: 'section-title' }, h('span', null, 'Documents'), h('button', { class: 'link-btn', onclick: () => { selectMode = !selectMode; selected.clear(); refresh(); } }, 'Select')),
    selectBar,
    listEl,
  );
  // drag & drop (desktop/tablet)
  el.addEventListener('dragover', (e) => e.preventDefault());
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) importFiles(files);
  });
  refresh();
  return { el, resume: () => refresh() };
}

function about() {
  choose('About PocketPDF', [
    { label: 'Everything stays on your device', value: 0, icon: 'info', desc: 'Documents are stored locally in this browser/app. Nothing is uploaded.' },
    { label: 'Install as an app', value: 1, icon: 'download', desc: 'Android/Chrome: menu → Install app. iPhone/Safari: Share → Add to Home Screen.' },
    { label: 'Works offline', value: 2, icon: 'check', desc: 'After the first visit. OCR language packs download once when first used.' },
  ]);
}

/** Files shared into the app (Android share sheet via Web Share Target). */
export async function consumeSharedFiles() {
  if (!location.search.includes('share-target')) return;
  history.replaceState(null, '', location.pathname);
  try {
    const cache = await caches.open('share-inbox');
    const keys = await cache.keys();
    const files: File[] = [];
    for (const k of keys) {
      const r = await cache.match(k);
      if (!r) continue;
      const blob = await r.blob();
      const name = decodeURIComponent(r.headers.get('x-filename') || 'shared');
      files.push(new File([blob], name, { type: blob.type }));
      await cache.delete(k);
    }
    if (!files.length) return;
    const allImages = files.every((f) => fileKind(f) === 'image');
    if (allImages) {
      const c = await choose('Shared photos', [
        { label: 'Scan them (crop & enhance)', value: 'scan', icon: 'scan' },
        { label: 'Convert as-is to PDF', value: 'convert', icon: 'file' },
      ]);
      if (c === 'convert') return importFiles(files);
      if (c === 'scan') toast('Pick the photos again to scan them with crop & enhancement');
      if (c === 'scan') return startScan('photos');
      return;
    }
    await importFiles(files);
  } catch (e) {
    console.warn('share target failed', e);
  }
}

export { replace };
