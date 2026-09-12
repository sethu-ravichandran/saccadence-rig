// protocolTiming — pure duration math, mirrors TrialController's own timer
// scheduling so the HUD's estimate stays consistent with what actually runs.

/** Total planned trial duration in ms: both calibration brackets, fixation, saccade block, and pursuit block if present. */
export function estimatedDurationMs(protocol, calibrationMs) {
  const saccadeMs = (protocol.stepDegrees.length + 1) * protocol.stepIntervalMs;
  const pursuitMs = protocol.pursuit
    ? protocol.pursuit.passes * (2 * protocol.pursuit.amplitudeDeg / protocol.pursuit.velocityDegPerSec) * 1000
    : 0;
  return calibrationMs * 2 + protocol.fixationMs + saccadeMs + pursuitMs;
}
