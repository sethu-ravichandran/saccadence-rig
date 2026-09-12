// RigState — the four demo-visible phases: CALIBRATION -> READY -> RUNNING -> COMPLETED.
// Escape always returns to READY; R restarts RUNNING directly from READY or COMPLETED.

export const RigState = Object.freeze({
  CALIBRATION: 'calibration',
  READY: 'ready',
  RUNNING: 'running',
  COMPLETED: 'completed',
});
