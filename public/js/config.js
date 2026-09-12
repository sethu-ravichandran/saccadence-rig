// Config — the only module allowed to read URL params / hold constants.
// Nothing else in this app should reach into location.search directly.

// Guarded for node --test, which has no `location` global.
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

export const config = {
  // Visual-angle calibration: cut from scope per Path-to-100 (latency is a
  // frame count, needs no spatial calibration). Left wired in as harmless,
  // non-blocking bonus — nothing downstream depends on it being accurate.
  screenWidthMm: parseFloat(params.get('width_mm')) || 310,
  viewDistMm: parseFloat(params.get('dist_mm')) || 600,

  // Trial sequencing
  stepDegrees: [-12, 12, -8, 8, -15, 15, -5, 5, -10, 10],
  stepIntervalMs: 1800,

  // Marker geometry — must match marker-protocol.md / MarkerDecoder.kt exactly.
  marker: {
    squareFraction: 0.022,
    gapFraction: 0.006,
    marginFraction: 0.02,
    bitCount: 8,
  },
};
