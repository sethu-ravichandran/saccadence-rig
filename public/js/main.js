// main — wiring only. The single place that knows about every module.
// If you're looking for actual logic, it isn't here on purpose.

import { config } from './config.js';
import { MarkerEncoder } from './markerEncoder.js';
import { Renderer } from './renderer.js';
import { TrialController } from './trialController.js';
import { WsClient } from './wsClient.js';
import { attachControlSurface } from './controlSurface.js';
import { attachStartScreen, setPaired, setCalibrationConfirmed } from './startScreen.js';
import { attachHud } from './hud.js';
import { attachMarkerPreview } from './markerPreview.js';
import { RigState } from './rigState.js';
import { estimatedDurationMs } from './protocolTiming.js';

const canvas = document.getElementById('stage');
const markerCanvas = document.getElementById('marker-canvas');
const renderer = new Renderer(canvas, markerCanvas);
const markerEncoder = new MarkerEncoder(config.marker);
const hud = attachHud();

// Decorative live copy of the marker inside the calibrating-phase modal —
// same encoder, same flicker, just redrawn at a legible scale. The real
// marker (markerCanvas, above) is what the phone actually decodes.
const calibPreviewCanvas = document.getElementById('calib-marker-preview');
const markerPreview = calibPreviewCanvas
  ? attachMarkerPreview(calibPreviewCanvas, markerEncoder, config.marker.bitCount)
  : null;

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
    else if (type === 'peer_count') {
      setPaired(msg.count);
      hud.setPhonePaired(msg.count > 1);
    }
    else if (type === 'join_ack' && !msg.ok) console.log('[ws] join rejected:', msg.reason);
    else if (type === 'phone_ready') {
      console.log('[phone] marker locked, ready ✓ — Space will now end calibration.');
      markerConfirmedByPhone = true;
      hud.setMarkerConfirmed(true);
      setCalibrationConfirmed(true);
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
  onFrame: (state) => {
    renderer.draw(state);
    hud.update(state);
  },
  onEvent: (evt) => {
    console.log('[event]', evt.type, evt);
    if (evt.type === 'awaiting_post_calibration') showPostCalibrationPrompt();
    if (evt.type === 'trial_config') {
      trialStartMs = performance.now();
      trialPlannedMs = estimatedDurationMs(config.protocols[evt.protocolId], config.calibrationMs);
    }
    ws.send(evt);
  },
});


// Closing-calibration gate: the marker stays idle until the clinician
// confirms here, so the 5 s window can't open while the phone is still
// pointed at the patient. See TrialController._awaitPostCalibration.
const postCalibPrompt = document.getElementById('post-calib-prompt');
const postCalibOk = document.getElementById('post-calib-ok');

function showPostCalibrationPrompt() {
  if (!postCalibPrompt) return;
  postCalibPrompt.hidden = false;
  postCalibOk?.focus();
}

function hidePostCalibrationPrompt() {
  if (postCalibPrompt) postCalibPrompt.hidden = true;
}

postCalibOk?.addEventListener('click', () => {
  hidePostCalibrationPrompt();
  trial.beginPostCalibration();
});

// Feeds hud.js's time-remaining/estimate line — hud.js owns the DOM, this
// just computes the string (mirrors TrialController's own timer scheduling
// via protocolTiming.js so the estimate stays consistent with what runs).
function updateTiming() {
  if (trial.state === RigState.SETUP_CALIBRATION) {
    hud.setTimingText('');
    return;
  }
  if (trial.state === RigState.READY || trial.state === RigState.COMPLETED) {
    trialStartMs = null;
    const protocol = config.protocols[config.protocolId];
    const estSec = Math.round(estimatedDurationMs(protocol, config.calibrationMs) / 1000);
    hud.setTimingText(`${protocol.label} — est. ${estSec}s`);
  } else if (trialStartMs !== null) {
    const remainingMs = Math.max(0, trialPlannedMs - (performance.now() - trialStartMs));
    hud.setTimingText(`~${Math.ceil(remainingMs / 1000)}s remaining`);
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
    hidePostCalibrationPrompt();
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
  onCalibrate: (settings) => {
    console.log('[session]', settings);
    hud.setSessionInfo({ sessionCode: settings.sessionCode, protocolLabel: settings.protocolLabel });
    markerConfirmedByPhone = false;
    hud.setMarkerConfirmed(false);
    // Calibration is the first moment anything decodes the marker, so this
    // is where the real corner strip appears — it stays hidden through the
    // onboarding steps, where it would just be unexplained flicker.
    markerCanvas.hidden = false;
    trial.beginSetupCalibration();
  },
});

// Steady render loop: the marker's frame counter free-runs here, once per
// actual rendered frame, regardless of whether a step jump happened.
function loop() {
  trial.tick();
  updateTiming();
  markerPreview?.draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

console.log('[ready] Space=end-calibration/start  R=repeat  Esc=stop  1=full protocol  2=saccade-only');
console.log(`[geometry] width_mm=${config.screenWidthMm} dist_mm=${config.viewDistMm} (authoritative — drives step amplitude and pursuit velocity)`);
