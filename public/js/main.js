// main — wiring only. The single place that knows about every module.
// If you're looking for actual logic, it isn't here on purpose.

import { config } from './config.js';
import { MarkerEncoder } from './markerEncoder.js';
import { Renderer } from './renderer.js';
import { TrialController } from './trialController.js';
import { WsClient } from './wsClient.js';
import { attachControlSurface } from './controlSurface.js';
import { attachStartScreen, setPaired } from './startScreen.js';
import { attachHud } from './hud.js';
import { RigState } from './rigState.js';

const canvas = document.getElementById('stage');
const renderer = new Renderer(canvas);
const markerEncoder = new MarkerEncoder(config.marker);
const hud = attachHud();

// Set by attachStartScreen's onSessionCode as soon as the page generates its
// pairing code (before the operator has even submitted the login form) and
// re-sent on every ws (re)connect, so a mid-demo reconnect re-registers the
// same session without operator action.
let sessionCode = null;

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
  },
});

const trial = new TrialController({
  markerEncoder,
  config,
  onFrame: (state) => {
    renderer.draw(state);
    hud.update(state);
  },
  onEvent: (evt) => {
    console.log('[event]', evt.type, evt);
    ws.send(evt);
  },
});

function resize() {
  renderer.resize();
  trial.setCanvasSize(renderer.width, renderer.height);
}
window.addEventListener('resize', resize);
resize();

attachControlSurface({
  onStart: () => {
    // First Space after the setup gate ends it; every Space after that starts a trial.
    if (trial.state === RigState.SETUP_CALIBRATION) trial.endSetupCalibration();
    else ws.send(trial.start('local-test'));
  },
  onRepeat: () => ws.send(trial.start('repeat')),
  onStop: () => {
    if (trial.state === RigState.SETUP_CALIBRATION) trial.endSetupCalibration();
    trial.stop();
    ws.send({ type: 'stop' });
  },
  onSelectProtocol: (protocolId) => {
    // Only meaningful before a trial starts; harmless no-op mid-run since
    // TrialController snapshots the protocol at start().
    if (trial.state !== RigState.READY && trial.state !== RigState.COMPLETED) return;
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
    hud.setSessionInfo({ sessionCode: settings.sessionCode, protocolLabel: settings.protocolLabel });
    trial.beginSetupCalibration();
  },
});

// Steady render loop: the marker's frame counter free-runs here, once per
// actual rendered frame, regardless of whether a step jump happened.
function loop() {
  trial.tick();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

console.log('[ready] Space=end-calibration/start  R=repeat  Esc=stop  1=full protocol  2=saccade-only');
console.log(`[geometry] width_mm=${config.screenWidthMm} dist_mm=${config.viewDistMm} (authoritative — drives step amplitude and pursuit velocity)`);
