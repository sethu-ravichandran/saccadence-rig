// main — wiring only. The single place that knows about every module.
// If you're looking for actual logic, it isn't here on purpose.

import { config } from './config.js';
import { MarkerEncoder } from './markerEncoder.js';
import { Renderer } from './renderer.js';
import { TrialController } from './trialController.js';
import { WsClient } from './wsClient.js';
import { attachControlSurface } from './controlSurface.js';
import { attachStartScreen, setPaired } from './startScreen.js';
import { RigState } from './rigState.js';
import { estimatedDurationMs } from './protocolTiming.js';

const canvas = document.getElementById('stage');
const renderer = new Renderer(canvas);
const markerEncoder = new MarkerEncoder(config.marker);

// Set by attachStartScreen's onSessionCode as soon as the page generates its
// pairing code (before the operator has even submitted the login form) and
// re-sent on every ws (re)connect, so a mid-demo reconnect re-registers the
// same session without operator action.
let sessionCode = null;

// Set once the phone's camera has locked the guard marker and the clinician
// has tapped "Start test" there (phone_ready). Space can't end the setup
// gate — and so can't move the rig into a trial — until this is true, per
// the "don't enter until the marker is detected and Start test is tapped"
// requirement. Reset on every fresh setup-calibration entry so a rig
// restart/reconnect can't carry a stale confirmation into a new session.
let markerConfirmedByPhone = false;

const ws = new WsClient({
  onOpen: () => {
    if (sessionCode) ws.send({ type: 'register_rig', sessionCode });
  },
  onMessage: (msg) => {
    const type = msg.type ?? msg.cmd;
    if (type === 'start_trial') trial.start(msg.subject_id);
    else if (type === 'next_target') trial.manualTarget(msg.x, msg.y);
    else if (type === 'stop') trial.stop();
    else if (type === 'peer_count') setPaired(msg.count);
    else if (type === 'join_ack' && !msg.ok) console.log('[ws] join rejected:', msg.reason);
    else if (type === 'phone_ready') {
      console.log('[phone] marker locked, ready ✓ — Space will now end calibration.');
      markerConfirmedByPhone = true;
    }
  },
});

// Drives the HUD's "time remaining" line — set on trial_config (fires for
// both a locally-started trial and one driven remotely via Office Kit),
// cleared once the trial reaches COMPLETED.
let trialStartMs = null;
let trialPlannedMs = 0;

const trial = new TrialController({
  markerEncoder,
  config,
  onFrame: (state) => renderer.draw(state),
  onEvent: (evt) => {
    console.log('[event]', evt.type, evt);
    if (evt.type === 'trial_config') {
      trialStartMs = performance.now();
      trialPlannedMs = estimatedDurationMs(config.protocols[evt.protocolId], config.calibrationMs);
    }
    ws.send(evt);
  },
});

const hudTimeEl = document.getElementById('hud-time');
const calibGateEl = document.getElementById('calib-gate-status');

function updateHud() {
  if (!hudTimeEl) return;
  if (trial.state === RigState.SETUP_CALIBRATION) {
    hudTimeEl.textContent = '';
    if (calibGateEl) {
      calibGateEl.textContent = markerConfirmedByPhone
        ? 'Marker confirmed by phone ✓ — press Space to end calibration.'
        : 'Waiting for the phone to confirm marker lock…';
      calibGateEl.style.color = markerConfirmedByPhone ? '#4ade80' : '#f5a623';
    }
    return;
  }
  if (calibGateEl) calibGateEl.textContent = '';
  if (trial.state === RigState.READY || trial.state === RigState.COMPLETED) {
    trialStartMs = null;
    const protocol = config.protocols[config.protocolId];
    const estSec = Math.round(estimatedDurationMs(protocol, config.calibrationMs) / 1000);
    hudTimeEl.textContent = `Selected: ${protocol.label} — est. ${estSec}s`;
  } else if (trialStartMs !== null) {
    const remainingMs = Math.max(0, trialPlannedMs - (performance.now() - trialStartMs));
    hudTimeEl.textContent = `Trial running — ~${Math.ceil(remainingMs / 1000)}s remaining`;
  }
}

function resize() {
  renderer.resize();
  trial.setCanvasSize(renderer.width, renderer.height);
}
window.addEventListener('resize', resize);
resize();

attachControlSurface({
  onStart: () => {
    // First Space after the setup gate ends it; every Space after that starts a trial.
    if (trial.state === RigState.SETUP_CALIBRATION) {
      if (!markerConfirmedByPhone) {
        console.log('[calibration] Space ignored — waiting for the phone to confirm marker lock and tap Start test.');
        return;
      }
      trial.endSetupCalibration();
    } else {
      ws.send(trial.start('local-test'));
    }
  },
  onRepeat: () => ws.send(trial.start('repeat')),
  onStop: () => {
    if (trial.state === RigState.SETUP_CALIBRATION) trial.endSetupCalibration();
    trial.stop();
    ws.send({ type: 'stop' });
  },
  onSelectProtocol: (protocolId) => {
    // Only meaningful before a trial starts; harmless no-op mid-run since
    // TrialController snapshots the protocol at start(). SETUP_CALIBRATION
    // counts as "before a trial starts" too — a clinician picking the
    // protocol while still confirming marker lock is the normal order of
    // operations, not a mid-run change.
    const midRun = trial.state !== RigState.SETUP_CALIBRATION
      && trial.state !== RigState.READY
      && trial.state !== RigState.COMPLETED;
    if (midRun) return;
    config.protocolId = protocolId;
    console.log('[protocol]', protocolId);
  },
});

attachStartScreen({
  config,
  onSessionCode: (code) => {
    sessionCode = code;
    ws.send({ type: 'register_rig', sessionCode });
  },
  onEnter: (settings) => {
    console.log('[session]', settings);
    markerConfirmedByPhone = false;
    trial.beginSetupCalibration();
  },
});

// Steady render loop: the marker's frame counter free-runs here, once per
// actual rendered frame, regardless of whether a step jump happened.
function loop() {
  trial.tick();
  updateHud();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

console.log('[ready] Space=end-calibration/start  R=repeat  Esc=stop  1=full protocol  2=saccade-only');
console.log(`[geometry] width_mm=${config.screenWidthMm} dist_mm=${config.viewDistMm} (authoritative — drives step amplitude and pursuit velocity)`);
