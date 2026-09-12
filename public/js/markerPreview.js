// markerPreview — a decorative, legibly-scaled redraw of the same marker the
// phone actually decodes (same encoder instance: same frameId, same active
// flag), shown inside the calibration modal so the clinician can see the
// flicker happening instead of taking the real corner marker on faith.
//
// Deliberately does NOT reuse markerGeometry()'s squareFraction math — that's
// a fraction of a full screen's dimensions, tuned for the phone's actual
// decode target, and would render as ~1px specks at this small canvas size.
// Also deliberately does not touch markerEncoder.js (marked precision-
// critical) — this only reads its public frameId/active fields.

import { GUARD_ACTIVE_COLOR, GUARD_IDLE_COLOR, BIT_ONE_COLOR, BIT_ZERO_COLOR } from './markerEncoder.js';

export function attachMarkerPreview(canvas, markerEncoder, bitCount) {
  const ctx = canvas.getContext('2d');

  function draw() {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const count = bitCount + 1; // guard + bits
    const gap = 4;
    const side = Math.min((width - gap * (count - 1)) / count, height);
    const totalWidth = side * count + gap * (count - 1);
    const startX = (width - totalWidth) / 2 + side / 2;
    const cy = height / 2;

    ctx.fillStyle = markerEncoder.active ? GUARD_ACTIVE_COLOR : GUARD_IDLE_COLOR;
    ctx.fillRect(startX - side / 2, cy - side / 2, side, side);

    for (let i = 0; i < bitCount; i++) {
      // Mirrors markerEncoder.js's squares(): bitIndex 0 = MSB, closest to guard.
      const shift = 7 - i;
      const isOne = (markerEncoder.frameId >> shift) & 1;
      const cx = startX + (i + 1) * (side + gap);
      ctx.fillStyle = isOne ? BIT_ONE_COLOR : BIT_ZERO_COLOR;
      ctx.fillRect(cx - side / 2, cy - side / 2, side, side);
    }
  }

  return { draw };
}
