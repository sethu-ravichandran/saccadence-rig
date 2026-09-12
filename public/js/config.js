// Config — the only module allowed to read URL params / hold constants.
// Nothing else in this app should reach into location.search directly.

// Guarded for node --test, which has no `location` global.
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

export const config = {
  // Visual-angle geometry is AUTHORITATIVE (re-promoted per the mandatory
  // implementation plan): pursuit gain is fitted in deg/s against the
  // commanded velocity, so step amplitude and sweep velocity must be
  // rendered at true visual angle for the configured screen/distance.
  // Both values are editable on the start screen; URL params are defaults.
  screenWidthMm: parseFloat(params.get('width_mm')) || 310,
  viewDistMm: parseFloat(params.get('dist_mm')) || 600,

  // Optical calibration bracket: the marker-decode window the phone films
  // before AND after every trial (pre/post roles). 5 s per the plan.
  calibrationMs: 5000,

  // Trial protocols. Every trial runs:
  //   pre-calibration -> fixation -> saccade steps [-> pursuit sweeps] -> post-calibration
  protocolId: 'full-90s',
  protocols: {
    'saccade-latency-10step': {
      label: 'Saccade Latency (10-step)',
      fixationMs: 10000,
      stepDegrees: [-12, 12, -8, 8, -15, 15, -5, 5, -10, 10],
      stepIntervalMs: 1800,
      pursuit: null,
    },
    'full-90s': {
      label: 'Full Protocol — saccade + pursuit (~90 s)',
      fixationMs: 10000,
      stepDegrees: [-12, 12, -8, 8, -15, 15, -5, 5, -10, 10],
      stepIntervalMs: 1800,
      // 12 constant-velocity passes of ±12° at 10 deg/s ≈ 29 s of pursuit.
      pursuit: { amplitudeDeg: 12, velocityDegPerSec: 10, passes: 12 },
    },
  },

  // Marker geometry — must match marker-protocol.md / MarkerDecoder.kt exactly.
  marker: {
    squareFraction: 0.022,
    gapFraction: 0.006,
    marginFraction: 0.02,
    bitCount: 8,
  },
};
