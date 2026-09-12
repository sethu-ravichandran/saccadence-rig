// Verifies markerEncoder.js produces something MarkerDecoder.kt can
// actually decode. Ports the Kotlin decoder's own math (BT.601 luma/chroma,
// chroma-distance guard classification, Otsu threshold, MSB-first bit
// assembly) so this test is honestly checking protocol compatibility, not
// just "does the encoder run."
//
// Squares are solid fills, so sampling "at the square's center" is exact —
// this validates geometry/color/bit-order correctness. It does not
// rasterize a real canvas or model camera noise; that's what the Red Light
// risk gate on real hardware is for.

import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkerEncoder, markerGeometry } from '../public/js/markerEncoder.js';

const markerConfig = {
  squareFraction: 0.022,
  gapFraction: 0.006,
  marginFraction: 0.02,
  bitCount: 8,
};

function rgbFromCss(color) {
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

function luma({ r, g, b }) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function chroma({ r, g, b }) {
  const u = -0.169 * r - 0.331 * g + 0.5 * b + 128;
  const v = 0.5 * r - 0.419 * g - 0.081 * b + 128;
  return { u, v };
}

const GREEN_U = 44, GREEN_V = 21;
const RED_U = 85, RED_V = 255;
const CHROMA_MATCH_RADIUS_SQ = 40 * 40;

function chromaDistSq(u, v, tu, tv) {
  return (u - tu) ** 2 + (v - tv) ** 2;
}

/** Mirrors MarkerDecoder.kt's decode() logic, operating on encoder-declared squares. */
function decode(squares) {
  const [guard, ...bits] = squares;
  const guardChroma = chroma(rgbFromCss(guard.color));
  const greenDist = chromaDistSq(guardChroma.u, guardChroma.v, GREEN_U, GREEN_V);
  const redDist = chromaDistSq(guardChroma.u, guardChroma.v, RED_U, RED_V);

  let active;
  if (greenDist < CHROMA_MATCH_RADIUS_SQ && greenDist <= redDist) active = true;
  else if (redDist < CHROMA_MATCH_RADIUS_SQ) active = false;
  else return null; // no guard found

  const bitLumas = bits.map((b) => luma(rgbFromCss(b.color)));

  // Otsu over 8 samples that are always exactly 0 or 255 by construction —
  // any threshold strictly between them separates correctly.
  const threshold = 127;
  let frameId = 0;
  for (const l of bitLumas) {
    frameId = (frameId << 1) | (l > threshold ? 1 : 0);
  }

  return { active, frameId };
}

test('geometry stays inside the canvas for a typical laptop size', () => {
  const { side, pitch, guardCenterX, guardCenterY } = markerGeometry(1920, 1080, markerConfig);
  const lastBitRightEdge = guardCenterX + 8 * pitch + side / 2;
  assert.ok(guardCenterX - side / 2 >= 0, 'guard left edge off-canvas');
  assert.ok(lastBitRightEdge <= 1920, 'last bit square off-canvas');
  assert.ok(guardCenterY + side / 2 <= 1080, 'marker row off bottom of canvas');
});

test('round-trips frame id 0 while active', () => {
  const enc = new MarkerEncoder(markerConfig);
  enc.setActive(true);
  const result = decode(enc.squares(1920, 1080));
  assert.equal(result.active, true);
  assert.equal(result.frameId, 0);
});

test('round-trips frame id 255 (all-one)', () => {
  const enc = new MarkerEncoder(markerConfig);
  enc.setActive(true);
  for (let i = 0; i < 255; i++) enc.tick();
  const result = decode(enc.squares(1920, 1080));
  assert.equal(result.frameId, 255);
});

test('round-trips arbitrary frame ids matching MarkerDecoderTest.kt cases', () => {
  for (const target of [180, 42, 91]) {
    const enc = new MarkerEncoder(markerConfig);
    for (let i = 0; i < target; i++) enc.tick();
    const result = decode(enc.squares(1920, 1080));
    assert.equal(result.frameId, target, `expected ${target}, got ${result.frameId}`);
  }
});

test('wraps 255 -> 0', () => {
  const enc = new MarkerEncoder(markerConfig);
  for (let i = 0; i < 256; i++) enc.tick();
  const result = decode(enc.squares(1920, 1080));
  assert.equal(result.frameId, 0);
});

test('idle guard reads red and still decodes a frame id', () => {
  const enc = new MarkerEncoder(markerConfig);
  enc.setActive(false);
  for (let i = 0; i < 42; i++) enc.tick();
  const result = decode(enc.squares(1920, 1080));
  assert.equal(result.active, false);
  assert.equal(result.frameId, 42);
});

test('active guard classifies as green beyond doubt', () => {
  const enc = new MarkerEncoder(markerConfig);
  enc.setActive(true);
  const [guard] = enc.squares(1920, 1080);
  const c = chroma(rgbFromCss(guard.color));
  const dist = chromaDistSq(c.u, c.v, GREEN_U, GREEN_V);
  assert.ok(dist < 5, `guard chroma (${c.u},${c.v}) too far from green target, dist=${dist}`);
});

test('idle guard classifies as red beyond doubt', () => {
  const enc = new MarkerEncoder(markerConfig);
  enc.setActive(false);
  const [guard] = enc.squares(1920, 1080);
  const c = chroma(rgbFromCss(guard.color));
  const dist = chromaDistSq(c.u, c.v, RED_U, RED_V);
  assert.ok(dist < 5, `guard chroma (${c.u},${c.v}) too far from red target, dist=${dist}`);
});
