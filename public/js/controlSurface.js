// ControlSurface — the full Office Kit remote-control input surface. Office
// Kit drives the stimulus per the deck's claim, so every action a clinician
// needs during a live run — start/repeat/stop AND protocol selection — has
// to be reachable from these key events alone, with no mouse/touch fallback
// required. Built to survive Office Kit's remote-control input lag: plain
// keydown, no chords, no held-key repeats relied upon. Nothing else in this
// app listens for keyboard input.

export function attachControlSurface({ onStart, onRepeat, onStop, onSelectProtocol }) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      onStart();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      onRepeat();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      onStop();
    } else if (e.code === 'Digit1') {
      e.preventDefault();
      onSelectProtocol?.('full-90s');
    } else if (e.code === 'Digit2') {
      e.preventDefault();
      onSelectProtocol?.('saccade-latency-10step');
    }
  });
}
