# PocketPDF — phone document scanner & PDF toolkit

An installable mobile app (Progressive Web App) for Android and iPhone. Everything runs **on the device**: documents are stored locally and never uploaded.

## Features

**Scanner**
- Live camera preview that outlines the document as you aim. Optional auto-capture fires once the outline holds steady. Flash/torch toggle where the phone supports it.
- Scan from existing photos too, one or many at a time.
- Automatic edge detection suggests a crop frame. You can adjust it with 4 corner handles and 4 edge handles; a magnifier shows detail while you drag. *Auto* re-detects; *Full* uses the whole image.
- Perspective correction straightens skewed, angled shots and recovers the page's true aspect ratio.
- Lighting compensation evens out shadows, gradients and tinted light. Filters: Auto, Color, Grayscale, B&W, Original. Brightness and contrast sliders, plus rotate.
- After each page it asks **"Scan next page / Add from photos / Done"** so you can build multi-page documents. Review screen to re-crop, re-filter, reorder, retake or delete pages.
- Save options: page size (fit to scan, Letter, A4, Legal), quality, and optional OCR so the scan becomes searchable and selectable.

**PDF tools**
- **View:** smooth scrolling, pinch/double-tap/button zoom, page indicator, full-text search with highlights.
- **Edit text:** tap any line of existing text to rewrite it (matches size, font family, color and background), or add new text anywhere.
- **Markup:** pen, highlighter, text, box, oval, line, arrow, whiteout, **secure redaction** (flattens the page so hidden text is really removed), eraser, select/move/resize/duplicate, color & size, undo/redo.
- **Fill & Sign:** fill real form fields (text, checkboxes, radio buttons, dropdowns) and save them into the PDF. *Next field* steps through the form. For flat forms, place text, ✓/✗ marks and dates yourself. Draw signatures and initials and save them for reuse. Stamps (Approved, Draft, Paid…) and images.
- **OCR:** recognize text on the current page, all pages, or only pages without text. Adds an invisible text layer and lets you copy or share the text. English works offline; 9 more languages download once when first used.
- **Pages:** reorder, rotate, delete, duplicate, extract to a new document, insert blank pages, insert scans, insert files.
- **Add other file formats:** PDF, images (JPG/PNG/WebP/GIF/BMP/HEIC where supported), Word `.docx`, HTML, TXT/Markdown/CSV/JSON/code files. You can combine many files into one PDF.
- **More:** page numbers, watermark, flatten form, reduce file size, export a page as JPG, share (native share sheet), download, print, rename, document info.
- **Library:** thumbnails, rename, duplicate, delete, multi-select merge.
- Works offline after the first visit. Opens password-protected PDFs. Can receive files from Android's share sheet once installed. Dark mode follows the system.

## Install on your phone

The camera needs HTTPS, so host the app at an HTTPS address (for example GitHub Pages; see below). Then:
- **Android (Chrome):** open the URL → ⋮ menu → *Install app*.
- **iPhone (Safari):** open the URL → Share → *Add to Home Screen*.

### Deploy with GitHub Pages
The repo includes `.github/workflows/deploy.yml`. In the repository settings, go to **Settings → Pages → Source: GitHub Actions**. Then push to `main` or run the workflow manually. The app is served at `https://<user>.github.io/<repo>/`.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173 (use --host URL on your phone; camera requires HTTPS or localhost)
npm run build    # production build in dist/
npm run preview  # serve the production build
```

Tech: TypeScript + Vite (no UI framework), [pdf.js](https://mozilla.github.io/pdf.js/) for rendering, [pdf-lib](https://pdf-lib.js.org/) for writing, [Tesseract.js](https://tesseract.projectnaptha.com/) for OCR, [mammoth](https://github.com/mwilson/mammoth.js) for `.docx`. The document detection, perspective warp and illumination correction are written in plain JS (`src/scanner/`), so there is no OpenCV download.

### Native app store builds (optional)
The PWA can be wrapped as a native app with [Capacitor](https://capacitorjs.com/):
`npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios && npx cap init PocketPDF com.example.pocketpdf --web-dir dist && npm run build && npx cap add android && npx cap open android`.

## Limitations
- Text editing replaces a line by covering it and redrawing it with a standard font (Helvetica/Times/Courier). It matches size and color, but not custom embedded fonts. Only standard Latin (WinAnsi) characters are supported in new text.
- XFA (LiveCycle) forms can't be filled field-by-field. Use the Text/Check tools on them instead.
- Encrypted PDFs open for viewing; saving changes to them may fail.
- Adding password protection to PDFs is not supported.
