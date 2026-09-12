// MarkerEncoder — the precision-critical piece. Mirrors MarkerDecoder.kt
// bit-for-bit: pitch formula, bit-index-to-shift mapping, and guard colors
// all have to match exactly or the decoder finds nothing.
//
// SRP: this module only computes *what* to draw (geometry + colors + the
// running frame counter). It never touches a canvas context itself —
// that's renderer.js's job.

export const GUARD_ACTIVE_COLOR = 'rgb(0, 255, 0)';
export const GUARD_IDLE_COLOR = 'rgb(255, 0, 0)';
export const BIT_ONE_COLOR = 'rgb(255, 255, 255)';
export const BIT_ZERO_COLOR = 'rgb(0, 0, 0)';

export function markerGeometry(canvasWidth, canvasHeight, markerConfig) {
  const { squareFraction, gapFraction, marginFraction, bitCount } = markerConfig;
  const minDim = Math.min(canvasWidth, canvasHeight);

  const side = minDim * squareFraction;
  const pitch = side * (1 + gapFraction / squareFraction);
  const margin = minDim * marginFraction;

  // Guard sits far enough left that the guard square itself plus all
  // bitCount squares to its right stay inside the margin.
  const rowSpan = bitCount * pitch;
  const guardCenterX = canvasWidth - margin - rowSpan - side / 2;
  const guardCenterY = canvasHeight - margin - side / 2;

  return { side, pitch, guardCenterX, guardCenterY };
}

export class MarkerEncoder {
  constructor(markerConfig) {
    this.markerConfig = markerConfig;
    this.frameId = 0; // 0-255, free-running regardless of active state
    this.active = false;
  }

  setActive(active) {
    this.active = active;
  }

  /** Call exactly once per rendered frame. */
  tick() {
    this.frameId = (this.frameId + 1) & 0xff;
  }

  /** Returns the squares to paint this frame: [{ cx, cy, side, color }] */
  squares(canvasWidth, canvasHeight) {
    const { side, pitch, guardCenterX, guardCenterY } = markerGeometry(
      canvasWidth,
      canvasHeight,
      this.markerConfig
    );

    const squares = [
      {
        cx: guardCenterX,
        cy: guardCenterY,
        side,
        color: this.active ? GUARD_ACTIVE_COLOR : GUARD_IDLE_COLOR,
      },
    ];

    for (let bitIndex = 0; bitIndex < this.markerConfig.bitCount; bitIndex++) {
      // bitIndex 0 = MSB (closest to guard), matches MarkerDecoderTest.kt's drawMarker.
      const shift = 7 - bitIndex;
      const isOne = (this.frameId >> shift) & 1;
      squares.push({
        cx: guardCenterX + (bitIndex + 1) * pitch,
        cy: guardCenterY,
        side,
        color: isOne ? BIT_ONE_COLOR : BIT_ZERO_COLOR,
      });
    }

    return squares;
  }
}
