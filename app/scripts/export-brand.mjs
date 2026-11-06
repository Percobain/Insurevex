// Export the approved image's contours once, then render all sizes from vector paths.
// Tooling stays outside the app's runtime dependencies:
// npm install --prefix /tmp/insurevex-brand-tools sharp@0.35.5 potrace@2.1.8 png-to-ico@3.0.2
// node app/scripts/export-brand.mjs
// Override the tooling location with BRAND_TOOLS_DIR if needed.
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolsDir = process.env.BRAND_TOOLS_DIR || "/tmp/insurevex-brand-tools";
const require = createRequire(join(resolve(toolsDir), "package.json"));
const sharp = require("sharp");
const potrace = require("potrace");
const { default: pngToIco } = await import(pathToFileURL(require.resolve("png-to-ico")).href);
const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
const brandDir = join(publicDir, "brand");
const INK = "#152321";
const PAPER = "#f4f4f0";
const source = join(brandDir, "source/transparent-master.png");

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const mask = Buffer.alloc(info.width * info.height, 255);
let left = info.width, top = info.height, right = 0, bottom = 0;
const columns = new Uint32Array(info.width);
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 128) continue;
    mask[y * info.width + x] = 0;
    columns[x]++;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
}
// Locate the clear gap separating the standalone symbol from the wordmark.
let gapStart = -1, wordStart = -1;
for (let x = left; x <= right; x++) {
  if (!columns[x] && gapStart < 0) gapStart = x;
  if (columns[x] && gapStart >= 0) {
    if (x - gapStart > 24) { wordStart = x; break; }
    gapStart = -1;
  }
}
if (wordStart < 0) throw new Error("Could not identify symbol/wordmark gap");
const height = bottom - top + 3;
const boxes = {
  logo: { left: left - 1, top: top - 1, width: right - left + 3, height },
  icon: { left: left - 1, top: top - 1, width: gapStart - left + 2, height },
  wordmark: { left: wordStart - 1, top: top - 1, width: right - wordStart + 3, height },
};
const maskPng = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
const paths = {};
for (const [name, box] of Object.entries(boxes)) {
  const crop = await sharp(maskPng).extract(box).png().toBuffer();
  paths[name] = await new Promise((resolvePath, reject) => {
    potrace.trace(crop, { threshold: 128, turdSize: 8, optTolerance: 0.2, color: INK }, (error, svg) => {
      if (error) reject(error);
      else resolvePath(svg.match(/<path\b[^>]*\/>/g).join(""));
    });
  });
  for (const [suffix, color] of [["", INK], ["-light", PAPER]]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}">${paths[name].replaceAll(INK, color)}</svg>\n`;
    await writeFile(join(brandDir, `${name}${suffix}.svg`), svg);
    const width = name === "logo" ? 2400 : name === "wordmark" ? 2000 : 1024;
    await sharp(Buffer.from(svg)).resize({ width }).png().toFile(join(brandDir, `${name}${suffix}.png`));
  }
}

function square(color = INK, background = PAPER, markWidth = 352, adaptive = false) {
  const box = boxes.icon;
  const scale = markWidth / box.width;
  const y = (512 - box.height * scale) / 2;
  const style = adaptive ? `<style>.paper{fill:${PAPER}}.mark{fill:${INK}}@media(prefers-color-scheme:dark){.paper{fill:${INK}}.mark{fill:${PAPER}}}</style>` : "";
  const shape = paths.icon.replaceAll(`fill="${INK}"`, adaptive ? 'class="mark"' : `fill="${color}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${style}<rect ${adaptive ? 'class="paper"' : `fill="${background}"`} width="512" height="512"/><g transform="translate(${(512 - markWidth) / 2} ${y}) scale(${scale})">${shape}</g></svg>`;
}
const appIcon = square();
const maskable = square(INK, PAPER, 320);
await writeFile(join(publicDir, "favicon.svg"), square(INK, PAPER, 416, true));
for (const [filename, size, svg] of [
  ["app-icon-192.png", 192, appIcon], ["app-icon-512.png", 512, appIcon],
  ["app-icon-maskable-512.png", 512, maskable],
  ["apple-touch-icon.png", 180, appIcon],
  ["avatar.png", 1024, square(PAPER, INK)],
]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(brandDir, filename));
}
const faviconPngs = await Promise.all([16, 32, 48, 64].map(size => sharp(Buffer.from(square(INK, PAPER, 416))).resize(size, size).png().toBuffer()));
await writeFile(join(publicDir, "favicon.ico"), await pngToIco(faviconPngs));

// Social cards use the same vector paths, rather than asking an image model to redraw the lettering.
const logoScale = 1040 / boxes.logo.width;
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${PAPER}"/><g transform="translate(80 212) scale(${logoScale})">${paths.logo}</g><text x="600" y="446" text-anchor="middle" fill="${INK}" font-family="Arial,Helvetica,sans-serif" font-size="30" letter-spacing="-0.5">Protect your stocks. Grow your savings safely.</text></svg>`;
await writeFile(join(brandDir, "social-card.svg"), card + "\n");
await sharp(Buffer.from(card)).png().toFile(join(brandDir, "social-card.png"));
const navbarSvg = await readFile(join(brandDir, "logo.svg"));
await sharp(navbarSvg).resize({ width: 760 }).png().toFile(join(brandDir, "navbar-logo.png"));
const draw = (name, x, y, width, light = false) => `<g transform="translate(${x} ${y}) scale(${width / boxes[name].width})">${light ? paths[name].replaceAll(INK, PAPER) : paths[name]}</g>`;
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1040" viewBox="0 0 1600 1040">
  <rect width="1600" height="1040" fill="${PAPER}"/>
  <g fill="${INK}" font-family="Arial,Helvetica,sans-serif"><text x="80" y="70" font-size="24" font-weight="bold">InsureVEX</text><text x="1520" y="70" text-anchor="end" font-size="18">Approved identity / Asset family</text></g>
  <path d="M80 104H1520" stroke="#dedfd9"/>
  ${draw("logo", 100, 190, 1400)}
  <rect x="80" y="490" width="900" height="270" rx="18" fill="${INK}"/>
  ${draw("logo", 125, 555, 810, true)}
  <rect x="1010" y="490" width="240" height="270" rx="18" fill="white"/>
  ${draw("icon", 1040, 555, 180)}
  <rect x="1280" y="490" width="240" height="270" rx="18" fill="${INK}"/>
  ${draw("icon", 1310, 555, 180, true)}
  <g fill="${INK}" font-family="Arial,Helvetica,sans-serif" font-size="17"><text x="80" y="798">Reversed lockup</text><text x="1010" y="798">Standalone icon</text><text x="1280" y="798">Avatar / App icon</text></g>
  <path d="M80 860H1520" stroke="#dedfd9"/>
  <rect x="80" y="900" width="40" height="40" rx="8" fill="${INK}"/>
  <rect x="134" y="900" width="40" height="40" rx="8" fill="${PAPER}" stroke="#dedfd9"/>
  <g fill="${INK}" font-family="Arial,Helvetica,sans-serif" font-size="18"><text x="200" y="926">Ink #152321 / Paper #F4F4F0</text><text x="1520" y="926" text-anchor="end">SVG + PNG / Favicons / Social / App icons</text><text x="80" y="992" font-size="16">Protect your stocks. Grow your savings safely.</text></g>
</svg>`;
await sharp(Buffer.from(sheet)).png().toFile(join(brandDir, "brand-sheet.png"));
console.log(JSON.stringify({ boxes, color: INK, background: PAPER, output: brandDir }, null, 2));
