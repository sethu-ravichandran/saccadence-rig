// RigState — the demo-visible phases.
//
// SETUP_CALIBRATION is the one-time session-start marker check (unchanged
// legacy behavior, gates Space -> READY). Every trial then runs its own
// bracket: PRE_CALIBRATION -> FIXATION -> SACCADE -> PURSUIT ->
// POST_CALIBRATION -> COMPLETED. PURSUIT is skipped for protocols with no
// pursuit block. Escape always returns to READY; R restarts a trial
// directly from READY or COMPLETED.

export const RigState = Object.freeze({
  SETUP_CALIBRATION: 'setup_calibration',
  READY: 'ready',
  PRE_CALIBRATION: 'pre_calibration',
  FIXATION: 'fixation',
  SACCADE: 'saccade',
  PURSUIT: 'pursuit',
  POST_CALIBRATION: 'post_calibration',
  COMPLETED: 'completed',

  // Legacy alias: pre-existing code/tests referred to the setup gate as
  // CALIBRATION and to the saccade block as RUNNING. Kept so nothing that
  // imports these names silently breaks.
  CALIBRATION: 'setup_calibration',
  RUNNING: 'saccade',
});
