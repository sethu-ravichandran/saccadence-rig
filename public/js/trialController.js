// TrialController — the trial state machine. Owns dot position + drives
// the marker encoder's active flag. Knows nothing about the DOM, canvas,
// or WebSocket — it's driven by calls (start/stop/manualTarget) and it
// calls back out (onFrame) with plain state for the renderer to paint, and
// (onEvent) with orchestration events worth sending over the wire.
//
// Full trial shape (mandatory per the implementation plan — every trial
// carries its own calibration bracket):
//
//   PRE_CALIBRATION -> FIXATION -> SACCADE -> [PURSUIT] -> POST_CALIBRATION -> COMPLETED
//
// PURSUIT only runs for protocols that define a pursuit block. The one-time
// session-start marker check (SETUP_CALIBRATION -> READY, gated by
// begin/endSetupCalibration) is unrelated to the per-trial bracket and
// unchanged from the original design.
//
// Marker guard semantics: green ("active") only during the two windows the
// phone actually decodes it in — PRE_CALIBRATION and POST_CALIBRATION. The
// marker is not required to be in-frame during FIXATION/SACCADE/PURSUIT
// (per the "marker occludes the far eye" hardware finding), so the guard is
// idle/red there; nothing depends on its color in that window.

import { degToPx } from './visualAngle.js';
import { RigState } from './rigState.js';

export class TrialController {
  constructor({ markerEncoder, config, onFrame, onEvent }) {
    this.markerEncoder = markerEncoder;
    this.config = config;
    this.onFrame = onFrame;
    this.onEvent = onEvent ?? (() => {});

    this.state = RigState.SETUP_CALIBRATION;
    this.trialId = null;
    this.protocol = null;
    this.dotX = 0;
    this.dotY = 0;
    this.stepIndex = 0;
    this.phaseTimer = null;
    this.pursuit = null;
    this.pursuitPassIndex = 0;
    this.canvasWidth = 0;
    this.canvasHeight = 0;
  }

  setCanvasSize(width, height) {
    this.canvasWidth = width;
    this.canvasHeight = height;
    if (this.dotX === 0 && this.dotY === 0) {
      this.dotX = width / 2;
      this.dotY = height / 2;
    }
  }

  // ---- one-time session-start marker check --------------------------------

  /** Enter the setup gate: marker renders (guard idle-red, bits free-running), no dot movement. */
  beginSetupCalibration() {
    this.state = RigState.SETUP_CALIBRATION;
    this.markerEncoder.setActive(false);
    this._jumpTo(this.canvasWidth / 2, this.canvasHeight / 2);
    this.onEvent({ type: 'calibration_start', role: 'setup', laptopTimeMs: now() });
  }

  /** Leave the setup gate -> Ready. No-op if it isn't the current state. */
  endSetupCalibration() {
    if (this.state !== RigState.SETUP_CALIBRATION) return;
    this.onEvent({ type: 'calibration_stop', role: 'setup', laptopTimeMs: now() });
    this.state = RigState.READY;
    this._paint();
  }

  // ---- trial lifecycle ------------------------------------------------------

  start(subjectId) {
    this._clearTimer();
    this.pursuit = null;
    this.trialId = crypto.randomUUID ? crypto.randomUUID() : `${subjectId}-${Date.now()}`;
    this.protocol = this.config.protocols[this.config.protocolId];
    this.stepIndex = 0;
    this.pursuitPassIndex = 0;
    this._jumpTo(this.canvasWidth / 2, this.canvasHeight / 2);

    this.onEvent({
      type: 'trial_config',
      trialId: this.trialId,
      protocolId: this.config.protocolId,
      screenWidthMm: this.config.screenWidthMm,
      viewDistMm: this.config.viewDistMm,
      stepDegrees: this.protocol.stepDegrees,
      pursuit: this.protocol.pursuit,
      laptopTimeMs: now(),
    });

    this._enterPreCalibration();
    return { type: 'start_trial', subject_id: subjectId, trialId: this.trialId, protocolId: this.config.protocolId };
  }

  stop() {
    this._clearTimer();
    this.pursuit = null;
    this.state = RigState.READY;
    this.markerEncoder.setActive(false);
    this._jumpTo(this.canvasWidth / 2, this.canvasHeight / 2);
  }

  /** External override during SACCADE only — a next_target message drives the dot directly. */
  manualTarget(x, y) {
    if (this.state !== RigState.SACCADE) return;
    this._clearTimer();
    this.stepIndex += 1;
    this._stepTo(x, y, this.stepIndex, null);
  }

  /** Advances the marker's free-running counter, steps pursuit motion, and repaints — call once per rAF. */
  tick() {
    this.markerEncoder.tick();
    if (this.state === RigState.PURSUIT && this.pursuit) {
      this._advancePursuit();
    }
    this._paint();
  }

  // ---- pre/post calibration bracket -----------------------------------------

  _enterPreCalibration() {
    this.state = RigState.PRE_CALIBRATION;
    this.markerEncoder.setActive(true);
    this._paint();
    this.onEvent({ type: 'calibration_start', role: 'pre', trialId: this.trialId, laptopTimeMs: now() });
    this.phaseTimer = setTimeout(() => this._endPreCalibration(), this.config.calibrationMs);
  }

  _endPreCalibration() {
    this.onEvent({ type: 'calibration_stop', role: 'pre', trialId: this.trialId, laptopTimeMs: now() });
    this.markerEncoder.setActive(false);
    this._enterFixation();
  }

  _enterFixation() {
    this.state = RigState.FIXATION;
    this._jumpTo(this.canvasWidth / 2, this.canvasHeight / 2);
    this.onEvent({ type: 'block_start', block: 'fixation', trialId: this.trialId, laptopTimeMs: now() });
    this.phaseTimer = setTimeout(() => this._endFixation(), this.protocol.fixationMs);
  }

  _endFixation() {
    this.onEvent({ type: 'block_end', block: 'fixation', trialId: this.trialId, laptopTimeMs: now() });
    this._enterSaccade();
  }

  // ---- saccade block ----------------------------------------------------------

  _enterSaccade() {
    this.state = RigState.SACCADE;
    this.stepIndex = 0;
    this.onEvent({ type: 'block_start', block: 'saccade', trialId: this.trialId, laptopTimeMs: now() });
    this._stepTo(this.canvasWidth / 2, this.canvasHeight / 2, 0, null);
    this.phaseTimer = setTimeout(() => this._runNextStep(), this.protocol.stepIntervalMs);
  }

  _runNextStep() {
    if (this.state !== RigState.SACCADE) return;
    if (this.stepIndex >= this.protocol.stepDegrees.length) {
      this.onEvent({ type: 'block_end', block: 'saccade', trialId: this.trialId, laptopTimeMs: now() });
      if (this.protocol.pursuit) this._enterPursuit();
      else this._enterPostCalibration();
      return;
    }
    const deg = this.protocol.stepDegrees[this.stepIndex];
    const offset = degToPx(deg, this.canvasWidth, this.config.screenWidthMm, this.config.viewDistMm);
    this._stepTo(this.canvasWidth / 2 + offset, this.canvasHeight / 2, this.stepIndex + 1, deg);
    this.stepIndex += 1;
    this.phaseTimer = setTimeout(() => this._runNextStep(), this.protocol.stepIntervalMs);
  }

  /** Move the dot as an explicit numbered target — emits target_step for Android. */
  _stepTo(x, y, targetIndex, stepAmplitudeDeg) {
    this.dotX = x;
    this.dotY = y;
    this._paint();
    this.onEvent({
      type: 'target_step',
      trialId: this.trialId,
      targetIndex,
      stepAmplitudeDeg,
      x,
      y,
      laptopTimeMs: now(),
    });
  }

  // ---- pursuit block ------------------------------------------------------------

  _enterPursuit() {
    this.state = RigState.PURSUIT;
    this.pursuitPassIndex = 0;
    this.onEvent({ type: 'block_start', block: 'pursuit', trialId: this.trialId, laptopTimeMs: now() });
    this._startPursuitPass();
  }

  _startPursuitPass() {
    const { amplitudeDeg, velocityDegPerSec, passes } = this.protocol.pursuit;
    if (this.pursuitPassIndex >= passes) {
      this.pursuit = null;
      this.onEvent({ type: 'block_end', block: 'pursuit', trialId: this.trialId, laptopTimeMs: now() });
      this._enterPostCalibration();
      return;
    }
    // Alternate sweep direction each pass; each pass runs edge-to-edge at
    // the commanded constant velocity.
    const direction = this.pursuitPassIndex % 2 === 0 ? 1 : -1;
    this.pursuit = {
      direction,
      velocityDegPerSec,
      amplitudeDeg,
      startMs: now(),
      startDeg: -direction * amplitudeDeg,
    };
    this._setPursuitDot(this.pursuit.startDeg);
    this.onEvent({
      type: 'sweep_start',
      trialId: this.trialId,
      passIndex: this.pursuitPassIndex,
      direction,
      amplitudeDeg,
      commandedVelocityDegPerSec: velocityDegPerSec,
      laptopTimeMs: now(),
    });
  }

  _advancePursuit() {
    const { direction, velocityDegPerSec, amplitudeDeg, startMs, startDeg } = this.pursuit;
    const elapsedSec = (now() - startMs) / 1000;
    const deg = startDeg + direction * velocityDegPerSec * elapsedSec;
    const reachedEnd = direction === 1 ? deg >= amplitudeDeg : deg <= -amplitudeDeg;
    if (reachedEnd) {
      this._setPursuitDot(direction === 1 ? amplitudeDeg : -amplitudeDeg);
      this.onEvent({
        type: 'sweep_end',
        trialId: this.trialId,
        passIndex: this.pursuitPassIndex,
        direction,
        laptopTimeMs: now(),
      });
      this.pursuitPassIndex += 1;
      this._startPursuitPass();
      return;
    }
    this._setPursuitDot(deg);
  }

  _setPursuitDot(deg) {
    const offset = degToPx(deg, this.canvasWidth, this.config.screenWidthMm, this.config.viewDistMm);
    this.dotX = this.canvasWidth / 2 + offset;
    this.dotY = this.canvasHeight / 2;
  }

  // ---- closing calibration ------------------------------------------------------

  _enterPostCalibration() {
    this.state = RigState.POST_CALIBRATION;
    this.markerEncoder.setActive(true);
    this._jumpTo(this.canvasWidth / 2, this.canvasHeight / 2);
    this.onEvent({ type: 'calibration_start', role: 'post', trialId: this.trialId, laptopTimeMs: now() });
    this.phaseTimer = setTimeout(() => this._endPostCalibration(), this.config.calibrationMs);
  }

  _endPostCalibration() {
    this.onEvent({ type: 'calibration_stop', role: 'post', trialId: this.trialId, laptopTimeMs: now() });
    this.markerEncoder.setActive(false);
    this.state = RigState.COMPLETED;
    this._paint();
  }

  // ---- shared helpers ------------------------------------------------------

  /** Move the dot without emitting a target event (calibration/fixation/stop re-centering). */
  _jumpTo(x, y) {
    this.dotX = x;
    this.dotY = y;
    this._paint();
  }

  _clearTimer() {
    clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }

  _paint() {
    this.onFrame({
      state: this.state,
      dotX: this.dotX,
      dotY: this.dotY,
      markerSquares: this.markerEncoder.squares(this.canvasWidth, this.canvasHeight),
    });
  }
}

// performance.now(): monotonic, page-load-relative ms — matches the
// laptopTimeMs example in the spec (123456.7), not an epoch timestamp.
function now() {
  return performance.now();
}
