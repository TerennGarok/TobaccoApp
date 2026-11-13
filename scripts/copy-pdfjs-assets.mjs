// Copies pdf.js character maps and standard fonts into public/ so they are
// served (and cached for offline use) alongside the app.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dst = join(root, 'public', 'pdfjs');
mkdirSync(dst, { recursive: true });
cpSync(join(src, 'cmaps'), join(dst, 'cmaps'), { recursive: true });
cpSync(join(src, 'standard_fonts'), join(dst, 'standard_fonts'), { recursive: true });
console.log('pdf.js assets copied to public/pdfjs');

// Self-hosted OCR engine + English language data (works offline, no CDN needed).
const tdst = join(root, 'public', 'tesseract');
mkdirSync(join(tdst, 'lang'), { recursive: true });
cpSync(join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'), join(tdst, 'worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) {
  cpSync(join(root, 'node_modules', 'tesseract.js-core', f), join(tdst, f));
}
cpSync(join(root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), join(tdst, 'lang', 'eng.traineddata.gz'));
console.log('tesseract assets copied to public/tesseract');
