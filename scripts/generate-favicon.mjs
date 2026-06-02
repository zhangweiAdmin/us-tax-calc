import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "public", "favicon.ico");

const COLORS = {
  primaryDark: [10, 74, 132, 255],
  primary: [14, 94, 168, 255],
  cream: [255, 247, 223, 245],
  ink: [24, 39, 64, 255],
  accent: [203, 79, 47, 255],
  white: [255, 255, 255, 255]
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function createCanvas(size) {
  return {
    width: size,
    height: size,
    data: new Uint8Array(size * size * 4)
  };
}

function blendPixel(canvas, x, y, rgba) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= canvas.width || yi >= canvas.height) return;

  const idx = (yi * canvas.width + xi) * 4;
  const srcA = rgba[3] / 255;
  const dstA = canvas.data[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;

  const outR = (rgba[0] * srcA + canvas.data[idx] * dstA * (1 - srcA)) / outA;
  const outG = (rgba[1] * srcA + canvas.data[idx + 1] * dstA * (1 - srcA)) / outA;
  const outB = (rgba[2] * srcA + canvas.data[idx + 2] * dstA * (1 - srcA)) / outA;

  canvas.data[idx] = clamp(Math.round(outR), 0, 255);
  canvas.data[idx + 1] = clamp(Math.round(outG), 0, 255);
  canvas.data[idx + 2] = clamp(Math.round(outB), 0, 255);
  canvas.data[idx + 3] = clamp(Math.round(outA * 255), 0, 255);
}

function fillRoundedRectGradient(canvas, x, y, w, h, radius, top, bottom) {
  for (let py = y; py < y + h; py += 1) {
    const t = h <= 1 ? 0 : (py - y) / (h - 1);
    const rowColor = [
      Math.round(lerp(top[0], bottom[0], t)),
      Math.round(lerp(top[1], bottom[1], t)),
      Math.round(lerp(top[2], bottom[2], t)),
      255
    ];
    for (let px = x; px < x + w; px += 1) {
      const dx = Math.min(px - x, x + w - 1 - px);
      const dy = Math.min(py - y, y + h - 1 - py);
      if (dx >= radius || dy >= radius) {
        blendPixel(canvas, px, py, rowColor);
        continue;
      }
      const cx = dx - radius;
      const cy = dy - radius;
      if (cx * cx + cy * cy <= radius * radius) {
        blendPixel(canvas, px, py, rowColor);
      }
    }
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-8) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function fillPolygon(canvas, points, color) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.floor(Math.min(...xs));
  const maxX = Math.ceil(Math.max(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) {
        blendPixel(canvas, x, y, color);
      }
    }
  }
}

function fillCircle(canvas, cx, cy, r, color) {
  const minX = Math.floor(cx - r);
  const maxX = Math.ceil(cx + r);
  const minY = Math.floor(cy - r);
  const maxY = Math.ceil(cy + r);
  const rr = r * r;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= rr) {
        blendPixel(canvas, x, y, color);
      }
    }
  }
}

function drawLine(canvas, x1, y1, x2, y2, thickness, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const x = lerp(x1, x2, t);
    const y = lerp(y1, y2, t);
    fillCircle(canvas, x, y, thickness / 2, color);
  }
}

function drawArc(canvas, cx, cy, r, startDeg, endDeg, thickness, color) {
  const total = Math.max(12, Math.ceil((Math.abs(endDeg - startDeg) / 360) * 80));
  for (let i = 0; i <= total; i += 1) {
    const t = total === 0 ? 0 : i / total;
    const deg = lerp(startDeg, endDeg, t);
    const rad = (deg * Math.PI) / 180;
    const x = cx + Math.cos(rad) * r;
    const y = cy + Math.sin(rad) * r;
    fillCircle(canvas, x, y, thickness / 2, color);
  }
}

function drawIcon(size) {
  const canvas = createCanvas(size);
  const pad = Math.round(size * 0.06);
  const radius = Math.round(size * 0.2);

  fillRoundedRectGradient(
    canvas,
    pad,
    pad,
    size - pad * 2,
    size - pad * 2,
    radius,
    COLORS.primaryDark,
    COLORS.primary
  );

  // Soft top highlight to keep the icon readable on dark tabs.
  fillCircle(
    canvas,
    size * 0.28,
    size * 0.2,
    size * 0.2,
    [255, 255, 255, 26]
  );

  const shield = [
    [size * 0.5, size * 0.18],
    [size * 0.78, size * 0.31],
    [size * 0.72, size * 0.66],
    [size * 0.5, size * 0.86],
    [size * 0.28, size * 0.66],
    [size * 0.22, size * 0.31]
  ];
  fillPolygon(canvas, shield, COLORS.cream);

  const stroke = Math.max(1.3, size * 0.08);
  drawLine(canvas, size * 0.5, size * 0.28, size * 0.5, size * 0.7, stroke * 0.44, COLORS.ink);
  drawArc(canvas, size * 0.49, size * 0.39, size * 0.13, 210, 335, stroke, COLORS.ink);
  drawArc(canvas, size * 0.51, size * 0.57, size * 0.13, 30, 155, stroke, COLORS.ink);

  // Accent check mark: conveys "safe / compliant".
  drawLine(canvas, size * 0.34, size * 0.61, size * 0.45, size * 0.71, stroke * 0.68, COLORS.accent);
  drawLine(canvas, size * 0.45, size * 0.71, size * 0.66, size * 0.49, stroke * 0.68, COLORS.accent);

  // Tiny white star for depth.
  drawLine(canvas, size * 0.74, size * 0.2, size * 0.78, size * 0.24, Math.max(1, size * 0.04), COLORS.white);
  drawLine(canvas, size * 0.78, size * 0.2, size * 0.74, size * 0.24, Math.max(1, size * 0.04), COLORS.white);

  return canvas;
}

function writeUInt16LE(buffer, value, offset) {
  buffer.writeUInt16LE(value, offset);
}

function writeUInt32LE(buffer, value, offset) {
  buffer.writeUInt32LE(value, offset);
}

function encodeBmpDib(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const rowBytes = width * 4;
  const xorSize = rowBytes * height;
  const andRowBytes = Math.ceil(width / 32) * 4;
  const andSize = andRowBytes * height;
  const headerSize = 40;
  const total = headerSize + xorSize + andSize;
  const out = Buffer.alloc(total);

  writeUInt32LE(out, 40, 0); // BITMAPINFOHEADER size
  writeUInt32LE(out, width, 4);
  writeUInt32LE(out, height * 2, 8); // includes AND mask
  writeUInt16LE(out, 1, 12); // planes
  writeUInt16LE(out, 32, 14); // bit count
  writeUInt32LE(out, 0, 16); // BI_RGB
  writeUInt32LE(out, xorSize + andSize, 20);
  writeUInt32LE(out, 0, 24); // ppm x
  writeUInt32LE(out, 0, 28); // ppm y
  writeUInt32LE(out, 0, 32); // clr used
  writeUInt32LE(out, 0, 36); // clr important

  let offset = headerSize;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      out[offset] = canvas.data[idx + 2]; // B
      out[offset + 1] = canvas.data[idx + 1]; // G
      out[offset + 2] = canvas.data[idx]; // R
      out[offset + 3] = canvas.data[idx + 3]; // A
      offset += 4;
    }
  }

  // AND mask (all zero, transparency carried by alpha channel).
  out.fill(0, offset);
  return out;
}

function buildIco(canvases) {
  const count = canvases.length;
  const headerSize = 6 + count * 16;
  const dibList = canvases.map((canvas) => encodeBmpDib(canvas));
  const totalSize = headerSize + dibList.reduce((sum, dib) => sum + dib.length, 0);
  const out = Buffer.alloc(totalSize);

  writeUInt16LE(out, 0, 0); // reserved
  writeUInt16LE(out, 1, 2); // icon
  writeUInt16LE(out, count, 4);

  let dataOffset = headerSize;
  for (let i = 0; i < count; i += 1) {
    const canvas = canvases[i];
    const dib = dibList[i];
    const entry = 6 + i * 16;
    out[entry] = canvas.width === 256 ? 0 : canvas.width;
    out[entry + 1] = canvas.height === 256 ? 0 : canvas.height;
    out[entry + 2] = 0; // color count
    out[entry + 3] = 0; // reserved
    writeUInt16LE(out, 1, entry + 4); // planes
    writeUInt16LE(out, 32, entry + 6); // bit count
    writeUInt32LE(out, dib.length, entry + 8);
    writeUInt32LE(out, dataOffset, entry + 12);
    dib.copy(out, dataOffset);
    dataOffset += dib.length;
  }

  return out;
}

async function run() {
  const sizes = [16, 32, 48];
  const canvases = sizes.map((size) => drawIcon(size));
  const ico = buildIco(canvases);
  await fs.writeFile(OUT_PATH, ico);
  console.log(`Wrote ${OUT_PATH}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
