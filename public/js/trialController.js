// TrialController — the trial state machine. Owns dot position + drives
// the marker encoder's active flag. Knows nothing about the DOM, canvas,
// or WebSocket — it's driven by calls (start/stop/manualTarget) and it
// calls back out (onFrame) with plain state for the renderer to paint.

import { degToPx } from './visualAngle.js';

export class TrialController {
  constructor({ markerEncoder, config, onFrame }) {
    this.markerEncoder = markerEncoder;
    this.config = config;
    this.onFrame = onFrame;

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

  start(subjectId) {
    clearTimeout(this.stepTimer);
    this.stepIndex = 0;
    this.running = true;
    this.markerEncoder.setActive(true);
    this._jumpTo(this.canvasWidth / 2, this.canvasHeight / 2);
    this.stepTimer = setTimeout(() => this._runNextStep(), this.config.stepIntervalMs);
    return { type: 'start_trial', subject_id: subjectId };
  }

  stop() {
    this.running = false;
    clearTimeout(this.stepTimer);
    this.markerEncoder.setActive(false);
    this._jumpTo(this.canvasWidth / 2, this.canvasHeight / 2);
  }

  /** External override — a next_target message drives the dot directly. */
  manualTarget(x, y) {
    clearTimeout(this.stepTimer);
    this._jumpTo(x, y);
  }

  _runNextStep() {
    if (!this.running) return;
    if (this.stepIndex >= this.config.stepDegrees.length) {
      this.running = false;
      this.markerEncoder.setActive(false);
      this._paint();
      return;
    }
    const deg = this.config.stepDegrees[this.stepIndex];
    const offset = degToPx(deg, this.canvasWidth, this.config.screenWidthMm, this.config.viewDistMm);
    this._jumpTo(this.canvasWidth / 2 + offset, this.canvasHeight / 2);
    this.stepIndex += 1;
    this.stepTimer = setTimeout(() => this._runNextStep(), this.config.stepIntervalMs);
  }

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
      dotX: this.dotX,
      dotY: this.dotY,
      markerSquares: this.markerEncoder.squares(this.canvasWidth, this.canvasHeight),
    });
  }
}
