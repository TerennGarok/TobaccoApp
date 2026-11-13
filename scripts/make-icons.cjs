// Renders public/icons/icon.svg to PNG app icons (run once: node scripts/make-icons.cjs).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../public/icons/icon.svg'), 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 0.12]]) {
    await p.setViewportSize({ width: size, height: size });
    const inner = size * (1 - pad * 2);
    await p.setContent(`<html><body style="margin:0;background:${pad ? '#0f766e' : 'transparent'};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
    await p.screenshot({ path: path.join(__dirname, '../public/icons', name), omitBackground: !pad });
  }
  await b.close();
})();
