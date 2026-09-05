#!/usr/bin/env node
/**
 * Generates the channel's placeholder artwork (icons, splash, spinner, tiles)
 * as PNGs with no external dependencies. Re-run after changing colours:
 *   node roku/tools/gen-images.js
 * Replace the output with real branding before Channel Store submission.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "images");
fs.mkdirSync(OUT, { recursive: true });

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (width * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function write(name, w, h, pixel) {
  fs.writeFileSync(path.join(OUT, name), png(w, h, pixel));
  console.log("wrote", name, `${w}x${h}`);
}

const BG = [16, 20, 24];
const ACCENT = [79, 163, 255];
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const mix = (a, b, t) => a.map((c, i) => clamp(c + (b[i] - c) * t));

/** Simple "play" glyph: circle with a triangle, centred at (cx, cy). */
function playGlyph(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  const ring = d <= r && d >= r * 0.86;
  const tri = dx > -r * 0.28 && dx < r * 0.5 && Math.abs(dy) < (r * 0.5 - dx) * 0.75 + 0.5 && dx < r * 0.5;
  return ring || (tri && d < r * 0.8);
}

function brand(w, h, withTitle) {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.22;
  write(withTitle, w, h, (x, y) => {
    const t = y / h;
    let col = mix(BG, [28, 35, 43], t);
    if (playGlyph(x, y, cx, cy, r)) col = ACCENT;
    return [...col, 255];
  });
}

// Icons, splash and logo come from roku/branding via tools/brand-images.ps1.
// Pass --placeholders to regenerate generic versions of those too.
if (process.argv.includes("--placeholders")) {
  brand(336, 210, "icon_focus_hd.png");
  brand(248, 140, "icon_focus_sd.png");
  brand(1280, 720, "splash_hd.png");
  brand(720, 480, "splash_sd.png");
  write("logo.png", 72, 72, (x, y) => (playGlyph(x, y, 36, 36, 34) ? [...ACCENT, 255] : [0, 0, 0, 0]));
}

write("spinner.png", 96, 96, (x, y) => {
  const dx = x - 48, dy = y - 48, d = Math.sqrt(dx * dx + dy * dy);
  if (d > 44 || d < 34) return [0, 0, 0, 0];
  const ang = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
  return [...ACCENT, clamp(40 + 215 * ang)];
});

write("gradient.png", 64, 540, (x, y) => {
  const t = y / 539;
  return [...BG, clamp(255 * Math.pow(t, 1.4))];
});

write("thumb_placeholder.png", 320, 180, (x, y) => {
  let col = [28, 35, 43];
  if (playGlyph(x, y, 160, 90, 36)) col = [80, 92, 105];
  return [...col, 255];
});

write("tile_all.png", 320, 180, (x, y) => {
  const t = (x + y) / 500;
  let col = mix([36, 60, 96], ACCENT, t * 0.5);
  // 3x2 grid of small squares
  const gx = Math.floor((x - 110) / 36), gy = Math.floor((y - 60) / 36);
  const inCell = x >= 110 && x < 218 && y >= 60 && y < 132 && (x - 110) % 36 < 28 && (y - 60) % 36 < 28;
  if (inCell && gx >= 0 && gx < 3 && gy >= 0 && gy < 2) col = [240, 244, 248];
  return [...col, 255];
});

write("tile_category.png", 320, 180, (x, y) => {
  const t = y / 180;
  let col = mix([40, 48, 58], [60, 72, 88], t);
  // folder glyph
  const inBody = x >= 110 && x < 210 && y >= 70 && y < 130;
  const inTab = x >= 110 && x < 155 && y >= 58 && y < 72;
  if (inBody || inTab) col = [220, 190, 110];
  return [...col, 255];
});
