// TrialController — the trial state machine. Owns dot position + drives
// the marker encoder's active flag. Knows nothing about the DOM, canvas,
// or WebSocket — it's driven by calls (start/stop/manualTarget) and it
// calls back out (onFrame) with plain state for the renderer to paint, and
// (onEvent) with orchestration events worth sending over the wire.

import { degToPx } from './visualAngle.js';
import { RigState } from './rigState.js';

export class TrialController {
  constructor({ markerEncoder, config, onFrame, onEvent }) {
    this.markerEncoder = markerEncoder;
    this.config = config;
    this.onFrame = onFrame;
    this.onEvent = onEvent ?? (() => {});

    this.state = RigState.CALIBRATION;
    this.trialId = null;
    this.dotX = 0;
    this.dotY = 0;
    this.running = false;
    this.stepIndex = 0;
    this.stepTimer = null;
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

  /** Enter calibration: marker renders (guard idle-red, bits free-running), no dot movement. */
  beginCalibration() {
    this.state = RigState.CALIBRATION;
    this.markerEncoder.setActive(false);
    this._jumpTo(this.canvasWidth / 2, this.canvasHeight / 2);
    this.onEvent({ type: 'calibration_start', laptopTimeMs: now() });
  }

  /** Leave calibration -> Ready. No-op if calibration isn't the current state. */
  endCalibration() {
    if (this.state !== RigState.CALIBRATION) return;
    this.onEvent({ type: 'calibration_stop', laptopTimeMs: now() });
    this.state = RigState.READY;
    this._paint();
  }

  start(subjectId) {
    clearTimeout(this.stepTimer);
    this.trialId = crypto.randomUUID ? crypto.randomUUID() : `${subjectId}-${Date.now()}`;
    this.stepIndex = 0;
    this.running = true;
    this.state = RigState.RUNNING;
    this.markerEncoder.setActive(true);
    this._stepTo(this.canvasWidth / 2, this.canvasHeight / 2, 0);
    this.stepTimer = setTimeout(() => this._runNextStep(), this.config.stepIntervalMs);
    return { type: 'start_trial', subject_id: subjectId, trialId: this.trialId };
  }

  stop() {
    this.running = false;
    this.state = RigState.READY;
    clearTimeout(this.stepTimer);
    this.markerEncoder.setActive(false);
    this._jumpTo(this.canvasWidth / 2, this.canvasHeight / 2);
  }

  /** External override — a next_target message drives the dot directly. */
  manualTarget(x, y) {
    clearTimeout(this.stepTimer);
    this.stepIndex += 1;
    this._stepTo(x, y, this.stepIndex);
  }

  _runNextStep() {
    if (!this.running) return;
    if (this.stepIndex >= this.config.stepDegrees.length) {
      this.running = false;
      this.state = RigState.COMPLETED;
      this.markerEncoder.setActive(false);
      this._paint();
      return;
    }
    const deg = this.config.stepDegrees[this.stepIndex];
    const offset = degToPx(deg, this.canvasWidth, this.config.screenWidthMm, this.config.viewDistMm);
    this._stepTo(this.canvasWidth / 2 + offset, this.canvasHeight / 2, this.stepIndex + 1);
    this.stepIndex += 1;
    this.stepTimer = setTimeout(() => this._runNextStep(), this.config.stepIntervalMs);
  }

  /** Move the dot as an explicit numbered target — emits target_step for Android. */
  _stepTo(x, y, targetIndex) {
    this.dotX = x;
    this.dotY = y;
    this._paint();
    this.onEvent({
      type: 'target_step',
      trialId: this.trialId,
      targetIndex,
      x,
      y,
      laptopTimeMs: now(),
    });
  }

  /** Move the dot without emitting a target event (calibration/stop re-centering). */
  _jumpTo(x, y) {
    this.dotX = x;
    this.dotY = y;
    this._paint();
  }

  /** Advances the marker's free-running counter and repaints — call once per rAF. */
  tick() {
    this.markerEncoder.tick();
    this._paint();
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
