import test from 'node:test';
import assert from 'node:assert/strict';
import { TrialController } from '../public/js/trialController.js';
import { MarkerEncoder } from '../public/js/markerEncoder.js';
import { config } from '../public/js/config.js';

function makeController() {
  const frames = [];
  const markerEncoder = new MarkerEncoder(config.marker);
  const trial = new TrialController({
    markerEncoder,
    config,
    onFrame: (state) => frames.push(state),
  });
  trial.setCanvasSize(1920, 1080);
  return { trial, markerEncoder, frames };
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
