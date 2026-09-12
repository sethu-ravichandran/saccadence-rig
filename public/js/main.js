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

const canvas = document.getElementById('stage');
const renderer = new Renderer(canvas);
const markerEncoder = new MarkerEncoder(config.marker);

const ws = new WsClient({
  onMessage: (msg) => {
    const type = msg.type ?? msg.cmd;
    if (type === 'start_trial') trial.start(msg.subject_id);
    else if (type === 'next_target') trial.manualTarget(msg.x, msg.y);
    else if (type === 'stop') trial.stop();
    else if (type === 'peer_count') setPaired(msg.count);
  },
});

const trial = new TrialController({
  markerEncoder,
  config,
  onFrame: (state) => renderer.draw(state),
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
    // First Space after the gate ends calibration; every Space after that starts a trial.
    if (trial.state === RigState.CALIBRATION) trial.endCalibration();
    else ws.send(trial.start('local-test'));
  },
  onRepeat: () => ws.send(trial.start('repeat')),
  onStop: () => {
    if (trial.state === RigState.CALIBRATION) trial.endCalibration();
    trial.stop();
    ws.send({ type: 'stop' });
  },
});

attachStartScreen({
  config,
  onEnter: (settings) => {
    console.log('[session]', settings);
    trial.beginCalibration();
  },
});

// Steady render loop: the marker's frame counter free-runs here, once per
// actual rendered frame, regardless of whether a step jump happened.
function loop() {
  trial.tick();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

console.log('[ready] Space=end-calibration/start  R=repeat  Esc=stop');
console.log(`[calib] width_mm=${config.screenWidthMm} dist_mm=${config.viewDistMm} (non-critical, cut from scope)`);
