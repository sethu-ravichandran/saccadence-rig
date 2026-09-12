// main — wiring only. The single place that knows about every module.
// If you're looking for actual logic, it isn't here on purpose.

import { config } from './config.js';
import { MarkerEncoder } from './markerEncoder.js';
import { Renderer } from './renderer.js';
import { TrialController } from './trialController.js';
import { WsClient } from './wsClient.js';
import { attachControlSurface } from './controlSurface.js';

const canvas = document.getElementById('stage');
const renderer = new Renderer(canvas);
const markerEncoder = new MarkerEncoder(config.marker);

const trial = new TrialController({
  markerEncoder,
  config,
  onFrame: (state) => renderer.draw(state),
});

function resize() {
  renderer.resize();
  trial.setCanvasSize(renderer.width, renderer.height);
}
window.addEventListener('resize', resize);
resize();

const ws = new WsClient({
  onMessage: (msg) => {
    const type = msg.type ?? msg.cmd;
    if (type === 'start_trial') trial.start(msg.subject_id);
    else if (type === 'next_target') trial.manualTarget(msg.x, msg.y);
    else if (type === 'stop') trial.stop();
  },
});

attachControlSurface({
  onStart: () => ws.send(trial.start('local-test')),
  onRepeat: () => ws.send(trial.start('repeat')),
  onStop: () => {
    trial.stop();
    ws.send({ type: 'stop' });
  },
});

// Steady render loop: the marker's frame counter free-runs here, once per
// actual rendered frame, regardless of whether a step jump happened.
function loop() {
  trial.tick();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

console.log('[ready] Space=start  R=repeat  Esc=stop');
console.log(`[calib] width_mm=${config.screenWidthMm} dist_mm=${config.viewDistMm} (non-critical, cut from scope)`);
