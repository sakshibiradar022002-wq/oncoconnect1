#!/usr/bin/env node
/**
 * Generate a 512x512 lab icon PNG with a microscope design.
 * Pure Node.js — no external image libraries needed.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeflateRaw } from 'node:zlib';
import { promisify } from 'node:util';

const deflate = promisify(createDeflateRaw);

const __dirname = dirname(fileURLToPath(import.meta.url));
const W = 512, H = 512;

// RGBA pixel buffer
const pixels = new Uint8Array(W * H * 4);

function setPixel(x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  // Alpha blend
  const srcA = a / 255;
  const dstA = pixels[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  pixels[i]     = Math.round((r * srcA + pixels[i]     * dstA * (1 - srcA)) / outA);
  pixels[i + 1] = Math.round((g * srcA + pixels[i + 1] * dstA * (1 - srcA)) / outA);
  pixels[i + 2] = Math.round((b * srcA + pixels[i + 2] * dstA * (1 - srcA)) / outA);
  pixels[i + 3] = Math.round(outA * 255);
}

function fillCircle(cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy++) {
    for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++) {
      if (dx * dx + dy * dy <= r2) setPixel(cx + dx, cy + dy, r, g, b, a);
    }
  }
}

function fillRect(x1, y1, x2, y2, r, g, b, a = 255) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++) setPixel(x, y, r, g, b, a);
}

function fillEllipse(cx, cy, rx, ry, r, g, b, a = 255) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) setPixel(cx + dx, cy + dy, r, g, b, a);
    }
  }
}

function fillLine(x1, y1, x2, y2, thickness, r, g, b, a = 255) {
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.max(Math.ceil(len), 1);
  const halfT = thickness / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    fillCircle(x, y, halfT, r, g, b, a);
  }
}

// === Background: rounded rectangle with gradient ===
// Dark purple gradient background
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    const r = Math.round(15 + t * 10);   // 15→25
    const g = Math.round(8 + t * 5);     // 8→13
    const b = Math.round(40 + t * 20);   // 40→60
    setPixel(x, y, r, g, b, 255);
  }
}

// Rounded corners mask
const cornerR = 80;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let inside = true;
    // Top-left
    if (x < cornerR && y < cornerR) {
      const dx = cornerR - x, dy = cornerR - y;
      if (dx * dx + dy * dy > cornerR * cornerR) inside = false;
    }
    // Top-right
    if (x >= W - cornerR && y < cornerR) {
      const dx = x - (W - cornerR), dy = cornerR - y;
      if (dx * dx + dy * dy > cornerR * cornerR) inside = false;
    }
    // Bottom-left
    if (x < cornerR && y >= H - cornerR) {
      const dx = cornerR - x, dy = y - (H - cornerR);
      if (dx * dx + dy * dy > cornerR * cornerR) inside = false;
    }
    // Bottom-right
    if (x >= W - cornerR && y >= H - cornerR) {
      const dx = x - (W - cornerR), dy = y - (H - cornerR);
      if (dx * dx + dy * dy > cornerR * cornerR) inside = false;
    }
    if (!inside) {
      const i = (y * W + x) * 4;
      pixels[i + 3] = 0; // transparent
    }
  }
}

// === Glowing circle behind microscope ===
fillCircle(256, 260, 140, 100, 60, 200, 40); // purple glow
fillCircle(256, 260, 120, 80, 50, 180, 60);  // inner glow
fillCircle(256, 260, 100, 60, 40, 160, 80);  // core

// === Microscope design ===

// Eyepiece (top)
const mx = 256, my = 260;

// Microscope tube (vertical body)
fillRect(mx - 12, my - 120, mx + 12, my - 20, 160, 180, 220, 255);

// Eyepiece lens (top circle)
fillCircle(mx, my - 130, 22, 140, 160, 210, 255);
fillCircle(mx, my - 130, 16, 100, 120, 190, 255);
fillCircle(mx, my - 130, 10, 80, 100, 170, 255);

// Body joint
fillCircle(mx, my - 20, 18, 150, 170, 215, 255);

// Arm (curved part going down-right)
fillLine(mx + 12, my - 20, mx + 50, my + 40, 22, 150, 170, 215, 255);
fillLine(mx + 50, my + 40, mx + 50, my + 80, 22, 150, 170, 215, 255);

// Stage (flat platform)
fillRect(mx - 50, my + 75, mx + 50, my + 85, 130, 150, 200, 255);

// Stage clip
fillRect(mx - 40, my + 70, mx - 30, my + 80, 160, 180, 220, 255);
fillRect(mx + 30, my + 70, mx + 40, my + 80, 160, 180, 220, 255);

// Objective lens (below stage)
fillRect(mx - 8, my + 85, mx + 8, my + 115, 140, 160, 210, 255);
fillCircle(mx, my + 115, 10, 120, 140, 200, 255);
fillCircle(mx, my + 115, 6, 80, 180, 255, 255); // lens glow

// Focus knobs
fillCircle(mx - 30, my + 20, 10, 120, 140, 195, 255);
fillCircle(mx - 30, my + 20, 6, 100, 120, 175, 255);

// Base
fillRect(mx - 60, my + 115, mx + 60, my + 130, 130, 150, 200, 255);
fillEllipse(mx, my + 135, 70, 12, 140, 160, 210, 255);

// Base foot
fillRect(mx - 70, my + 140, mx + 70, my + 155, 120, 140, 190, 255);

// === Glowing accent dots (tech feel) ===
fillCircle(mx - 80, my - 80, 4, 100, 220, 180, 180);
fillCircle(mx + 90, my - 60, 3, 100, 220, 180, 160);
fillCircle(mx - 100, my + 60, 3, 120, 180, 255, 160);
fillCircle(mx + 100, my + 90, 4, 100, 200, 255, 180);
fillCircle(mx - 60, my + 120, 3, 140, 160, 255, 160);
fillCircle(mx + 70, my - 100, 3, 100, 180, 255, 180);

// === DNA helix decorative elements (left side) ===
for (let t = 0; t < 40; t++) {
  const angle = t * 0.3;
  const x1 = 60 + Math.sin(angle) * 20;
  const y1 = 100 + t * 8;
  const x2 = 60 - Math.sin(angle) * 20;
  const y2 = y1;
  fillCircle(x1, y1, 3, 100, 200, 255, 140);
  fillCircle(x2, y2, 3, 180, 100, 255, 140);
  if (t % 3 === 0) fillLine(x1, y1, x2, y2, 1, 140, 160, 200, 80);
}

// === Flask decorative (right side) ===
fillCircle(440, 160, 25, 100, 200, 255, 60);
fillRect(434, 130, 446, 160, 100, 200, 255, 80);
fillCircle(440, 160, 18, 60, 180, 255, 80);
fillCircle(440, 160, 10, 80, 220, 255, 120);

// === Convert RGBA to PNG ===
async function createPNG() {
  // Build raw image data (filter byte + RGB per pixel per row)
  const rawData = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W * 4);
    rawData[rowStart] = 0; // no filter
    for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 4;
      const di = rowStart + 1 + x * 4;
      rawData[di]     = pixels[si];
      rawData[di + 1] = pixels[si + 1];
      rawData[di + 2] = pixels[si + 2];
      rawData[di + 3] = pixels[si + 3];
    }
  }

  const compressed = await deflate(rawData);

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type);
    const crcData = Buffer.concat([typeB, data]);
    let crc = 0xFFFFFFFF;
    for (const byte of crcData) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    crc = (crc ^ 0xFFFFFFFF) >>> 0;
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc);
    return Buffer.concat([len, typeB, data, crcB]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const png = Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);

  const outPath = join(__dirname, '..', 'public', 'icons', 'lab-512.png');
  writeFileSync(outPath, png);
  console.log(`✅ Lab icon created: ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
}

createPNG();
