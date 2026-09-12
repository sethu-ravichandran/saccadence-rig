import test from 'node:test';
import assert from 'node:assert/strict';
import { TrialController } from '../public/js/trialController.js';
import { MarkerEncoder } from '../public/js/markerEncoder.js';
import { config as realConfig } from '../public/js/config.js';
import { RigState } from '../public/js/rigState.js';

// Real phase durations (5s calibration, 10s fixation, ...) would make this
// suite take minutes. Every acceptance criterion the phases exist to
// satisfy — bracket ordering, event labelling, marker-active windows — is
// duration-independent, so tests run against millisecond-scale copies of
// the real protocol shapes instead of mocking timers.
function testConfig(overrides = {}) {
  return {
    ...realConfig,
    calibrationMs: 8,
    protocolId: 'test-no-pursuit',
    protocols: {
      'test-no-pursuit': {
        label: 'test (saccade only)',
        fixationMs: 8,
        stepDegrees: [-12, 12],
        stepIntervalMs: 8,
        pursuit: null,
      },
      'test-with-pursuit': {
        label: 'test (saccade + pursuit)',
        fixationMs: 8,
        stepDegrees: [-12, 12],
        stepIntervalMs: 8,
        // amplitude/velocity chosen so one full pass takes ~10ms of real
        // time: 2 * 10deg / 2000(deg/s) = 0.01s.
        pursuit: { amplitudeDeg: 10, velocityDegPerSec: 2000, passes: 2 },
      },
    },
    ...overrides,
  };
}

function makeController(overrides = {}) {
  const frames = [];
  const events = [];
  const config = testConfig(overrides);
  const markerEncoder = new MarkerEncoder(config.marker);
  const trial = new TrialController({
    markerEncoder,
    config,
    onFrame: (state) => frames.push(state),
    onEvent: (evt) => events.push(evt),
  });
  trial.setCanvasSize(1920, 1080);
  return { trial, markerEncoder, frames, events, config };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calls tick() every stepMs for totalMs of real time — needed for anything timed off performance.now() (pursuit) rather than setTimeout (phase transitions). */
async function pumpTicks(trial, totalMs, stepMs = 2) {
  const iterations = Math.ceil(totalMs / stepMs);
  for (let i = 0; i < iterations; i++) {
    await wait(stepMs);
    trial.tick();
  }
}

/** Polls until `predicate()` is true or the timeout elapses, ticking the trial each time. */
async function waitUntil(trial, predicate, { timeoutMs = 2000, stepMs = 3 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    trial.tick();
    if (predicate()) return;
    await wait(stepMs);
  }
  throw new Error('waitUntil timed out');
}

// ---- one-time session-start marker check --------------------------------

test('starts in SETUP_CALIBRATION; beginSetupCalibration emits calibration_start(role setup)', () => {
  const { trial, events } = makeController();
  assert.equal(trial.state, RigState.SETUP_CALIBRATION);
  trial.beginSetupCalibration();
  const evt = events.at(-1);
  assert.equal(evt.type, 'calibration_start');
  assert.equal(evt.role, 'setup');
  assert.equal(typeof evt.laptopTimeMs, 'number');
});

test('endSetupCalibration emits calibration_stop(role setup) and moves to READY; no-ops outside setup calibration', () => {
  const { trial, events } = makeController();
  trial.beginSetupCalibration();
  trial.endSetupCalibration();
  assert.equal(trial.state, RigState.READY);
  assert.equal(events.at(-1).type, 'calibration_stop');
  assert.equal(events.at(-1).role, 'setup');

  const before = events.length;
  trial.endSetupCalibration(); // already Ready — must not re-fire
  assert.equal(events.length, before);
});

// ---- trial start / bracket entry -----------------------------------------

test('start() emits trial_config, then enters PRE_CALIBRATION with the guard active and the dot centered', () => {
  const { trial, markerEncoder, events } = makeController();
  trial.start('subject-1');
  assert.equal(trial.state, RigState.PRE_CALIBRATION);
  assert.equal(trial.dotX, 960);
  assert.equal(trial.dotY, 540);
  assert.equal(markerEncoder.active, true);

  const config = events.find((e) => e.type === 'trial_config');
  assert.ok(config, 'expected a trial_config event');
  assert.equal(config.protocolId, 'test-no-pursuit');
  assert.deepEqual(config.stepDegrees, [-12, 12]);

  const preCal = events.find((e) => e.type === 'calibration_start' && e.role === 'pre');
  assert.ok(preCal, 'expected calibration_start(role pre)');
  assert.equal(preCal.trialId, trial.trialId);

  trial.stop();
});

test('manualTarget is ignored outside SACCADE (e.g. during PRE_CALIBRATION)', () => {
  const { trial, events } = makeController();
  trial.start('subject-1');
  const before = events.length;
  trial.manualTarget(42, 84);
  assert.equal(trial.dotX, 960, 'dot must not move from manualTarget outside SACCADE');
  assert.equal(events.length, before, 'manualTarget must not emit outside SACCADE');
  trial.stop();
});

test('stop() aborts mid-bracket back to READY, deactivates the guard, and re-centers', () => {
  const { trial, markerEncoder } = makeController();
  trial.start('subject-1'); // -> PRE_CALIBRATION
  trial.stop();
  assert.equal(trial.state, RigState.READY);
  assert.equal(markerEncoder.active, false);
  assert.equal(trial.dotX, 960);
  assert.equal(trial.dotY, 540);
});

test('tick() advances the marker frame counter regardless of phase', () => {
  const { trial, markerEncoder } = makeController();
  trial.start('subject-1');
  const before = markerEncoder.frameId;
  trial.tick();
  assert.equal(markerEncoder.frameId, (before + 1) & 0xff);
  trial.stop();
});

// ---- full bracket, no pursuit ---------------------------------------------

test('a no-pursuit trial runs PRE_CALIBRATION -> FIXATION -> SACCADE -> POST_CALIBRATION -> COMPLETED', async () => {
  const { trial, markerEncoder, events } = makeController();
  trial.start('subject-1');

  await waitUntil(trial, () => trial.state === RigState.COMPLETED, { timeoutMs: 3000 });

  assert.equal(markerEncoder.active, false, 'guard must be idle again after closing calibration');

  const types = events.map((e) => `${e.type}:${e.role ?? e.block ?? ''}`);
  const idx = (needle) => types.findIndex((t) => t.startsWith(needle));

  assert.ok(idx('calibration_start:pre') < idx('block_start:fixation'), 'pre-calibration before fixation');
  assert.ok(idx('block_start:fixation') < idx('block_end:fixation'), 'fixation start before end');
  assert.ok(idx('block_end:fixation') < idx('block_start:saccade'), 'fixation ends before saccade starts');
  assert.ok(idx('block_end:saccade') < idx('calibration_start:post'), 'saccade ends before closing calibration');
  assert.ok(idx('calibration_start:post') < idx('calibration_stop:post'), 'closing calibration starts before it stops');

  const preCal = events.find((e) => e.type === 'calibration_start' && e.role === 'pre');
  const postCal = events.find((e) => e.type === 'calibration_start' && e.role === 'post');
  assert.equal(preCal.trialId, trial.trialId);
  assert.equal(postCal.trialId, trial.trialId, 'closing calibration must carry the same trialId as the opening one');

  const steps = events.filter((e) => e.type === 'target_step');
  // index 0 = initial center dot, then one target_step per stepDegrees entry.
  assert.equal(steps.length, 3);
  assert.equal(steps[0].targetIndex, 0);
  assert.equal(steps[0].stepAmplitudeDeg, null);
  assert.equal(steps[1].stepAmplitudeDeg, -12);
  assert.equal(steps[2].stepAmplitudeDeg, 12);

  assert.equal(events.some((e) => e.type === 'block_start' && e.block === 'pursuit'), false);
});

// ---- full bracket, with pursuit -------------------------------------------

test('a pursuit-enabled trial runs SACCADE -> PURSUIT (sweep_start/sweep_end per pass) -> POST_CALIBRATION', async () => {
  const { trial, events } = makeController({ protocolId: 'test-with-pursuit' });
  trial.start('subject-1');

  await waitUntil(trial, () => trial.state === RigState.PURSUIT, { timeoutMs: 3000 });
  await pumpTicks(trial, 200, 2); // let both passes complete
  await waitUntil(trial, () => trial.state === RigState.COMPLETED, { timeoutMs: 3000 });

  const sweepStarts = events.filter((e) => e.type === 'sweep_start');
  const sweepEnds = events.filter((e) => e.type === 'sweep_end');
  assert.equal(sweepStarts.length, 2, 'expected one sweep_start per pass');
  assert.equal(sweepEnds.length, 2, 'expected one sweep_end per pass');
  assert.equal(sweepStarts[0].commandedVelocityDegPerSec, 2000);
  assert.equal(sweepStarts[0].direction, 1);
  assert.equal(sweepStarts[1].direction, -1, 'passes alternate direction');

  const types = events.map((e) => e.type + (e.block ? `:${e.block}` : ''));
  const pursuitStart = types.indexOf('block_start:pursuit');
  const pursuitEnd = types.indexOf('block_end:pursuit');
  assert.ok(pursuitStart >= 0 && pursuitEnd > pursuitStart, 'pursuit block must be bracketed by block_start/block_end');
  assert.ok(pursuitEnd < events.findLastIndex((e) => e.type === 'calibration_start' && e.role === 'post'),
    'pursuit block must finish before the closing calibration starts');
});
