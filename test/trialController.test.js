import test from 'node:test';
import assert from 'node:assert/strict';
import { TrialController } from '../public/js/trialController.js';
import { MarkerEncoder } from '../public/js/markerEncoder.js';
import { config } from '../public/js/config.js';
import { RigState } from '../public/js/rigState.js';

function makeController() {
  const frames = [];
  const events = [];
  const markerEncoder = new MarkerEncoder(config.marker);
  const trial = new TrialController({
    markerEncoder,
    config,
    onFrame: (state) => frames.push(state),
    onEvent: (evt) => events.push(evt),
  });
  trial.setCanvasSize(1920, 1080);
  return { trial, markerEncoder, frames, events };
}

test('start() centers the dot and activates the guard', () => {
  const { trial, markerEncoder } = makeController();
  trial.start('subject-1');
  assert.equal(trial.dotX, 960);
  assert.equal(trial.dotY, 540);
  assert.equal(markerEncoder.active, true);
  trial.stop(); // clear the pending timer so the test process can exit
});

test('stop() re-centers the dot and deactivates the guard', () => {
  const { trial, markerEncoder } = makeController();
  trial.start('subject-1');
  trial.manualTarget(100, 100);
  trial.stop();
  assert.equal(trial.dotX, 960);
  assert.equal(trial.dotY, 540);
  assert.equal(markerEncoder.active, false);
});

test('manualTarget overrides position immediately, independent of the step sequence', () => {
  const { trial } = makeController();
  trial.start('subject-1');
  trial.manualTarget(42, 84);
  assert.equal(trial.dotX, 42);
  assert.equal(trial.dotY, 84);
  trial.stop();
});

test('tick() advances the marker frame counter without moving the dot', () => {
  const { trial, markerEncoder } = makeController();
  trial.start('subject-1');
  trial.manualTarget(500, 500);
  const before = markerEncoder.frameId;
  trial.tick();
  assert.equal(markerEncoder.frameId, (before + 1) & 0xff);
  assert.equal(trial.dotX, 500);
  trial.stop();
});

test('starts in calibration; beginCalibration emits calibration_start with a laptop timestamp', () => {
  const { trial, events } = makeController();
  assert.equal(trial.state, RigState.CALIBRATION);
  trial.beginCalibration();
  const evt = events.at(-1);
  assert.equal(evt.type, 'calibration_start');
  assert.equal(typeof evt.laptopTimeMs, 'number');
});

test('endCalibration emits calibration_stop and moves to Ready; no-ops outside calibration', () => {
  const { trial, events } = makeController();
  trial.beginCalibration();
  trial.endCalibration();
  assert.equal(trial.state, RigState.READY);
  assert.equal(events.at(-1).type, 'calibration_stop');

  const before = events.length;
  trial.endCalibration(); // already Ready — must not re-fire
  assert.equal(events.length, before);
});

test('start() moves to Running and stepping through targets emits target_step events', () => {
  const { trial, events } = makeController();
  trial.start('subject-1');
  assert.equal(trial.state, RigState.RUNNING);

  const first = events.find((e) => e.type === 'target_step');
  assert.ok(first, 'expected a target_step event on trial start');
  assert.equal(first.targetIndex, 0);
  assert.equal(first.x, 960);
  assert.equal(first.y, 540);
  assert.equal(typeof first.trialId, 'string');
  assert.equal(typeof first.laptopTimeMs, 'number');

  trial.manualTarget(100, 200);
  const second = events.filter((e) => e.type === 'target_step').at(-1);
  assert.equal(second.targetIndex, 1);
  assert.equal(second.trialId, first.trialId);
  trial.stop();
});

test('stop() returns state to Ready', () => {
  const { trial } = makeController();
  trial.start('subject-1');
  trial.stop();
  assert.equal(trial.state, RigState.READY);
});
