// ControlSurface — exactly three keys, built to survive Office Kit's
// remote-control input lag. Nothing else listens for keyboard input.

export function attachControlSurface({ onStart, onRepeat, onStop }) {
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
    }
  });
}
