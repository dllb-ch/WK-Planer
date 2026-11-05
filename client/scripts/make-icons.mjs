// Renders the PWA icons (orange circle, blue triangle) as PNGs without external dependencies.
// Usage: node client/scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/icons');
const ORANGE = [249, 115, 22];
const BLUE = [30, 58, 138];

// Logo in a 32×32 coordinate system, as in the SVG favicon.
const inCircle = (x, y) => (x - 16) ** 2 + (y - 16) ** 2 <= 15 ** 2;
function inTriangle(x, y) {
  const s = (ax, ay, bx, by) => (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d1 = s(16, 6, 26, 24);
  const d2 = s(26, 24, 6, 24);
  const d3 = s(6, 24, 16, 6);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** @param {number} size @param {{ background?: number[], scale?: number }} opt */
function render(size, { background, scale = 1 }) {
  const SS = 4; // supersampling for smooth edges
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // Map pixel to logo coordinates, centred and scaled.
          const lx = 16 + (((x + (sx + 0.5) / SS) / size) * 32 - 16) / scale;
          const ly = 16 + (((y + (sy + 0.5) / SS) / size) * 32 - 16) / scale;
          let c = background ?? null;
          if (inCircle(lx, ly)) c = inTriangle(lx, ly) ? BLUE : ORANGE;
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      // Premultiplied average → straight alpha.
      px[i + 3] = Math.round(a / n);
      const cov = a / 255 || 1;
      px[i] = Math.round(r / cov);
      px[i + 1] = Math.round(g / cov);
      px[i + 2] = Math.round(b / cov);
    }
  }
  return png(size, px);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

mkdirSync(OUT, { recursive: true });
const files = {
  'icon-192.png': render(192, {}),
  'icon-512.png': render(512, {}),
  // Maskable and Apple icons need an opaque background; the logo stays inside the 80 % safe zone.
  'icon-maskable-512.png': render(512, { background: BLUE, scale: 0.72 }),
  'apple-touch-icon-180.png': render(180, { background: BLUE, scale: 0.8 }),
};
for (const [name, data] of Object.entries(files)) writeFileSync(join(OUT, name), data);
console.log('Icons written to', OUT);
