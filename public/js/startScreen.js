// StartScreen — clinic-rig demo gate: username + PIN, a few cosmetic settings,
// and a visible pairing code for the phone. Not real auth — just enough to
// "look real" per the demo-polish pass. Lives entirely in the DOM; nothing
// here touches trial/marker/WS logic.

const DEMO_PIN = '1234';

function randomSessionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

let pairStatusEl = null;

/** Called from main.js on every peer_count WS message — count includes this rig tab itself. */
export function setPaired(count) {
  if (!pairStatusEl) return;
  const paired = count > 1;
  pairStatusEl.textContent = paired ? 'Paired ✓' : 'Waiting for phone…';
  pairStatusEl.style.color = paired ? '#4ade80' : '#888';
}

export function attachStartScreen({ config, onEnter }) {
  const overlay = document.getElementById('start-screen');
  const form = document.getElementById('start-form');
  const errorEl = document.getElementById('start-error');
  const sessionCodeEl = document.getElementById('session-code');
  pairStatusEl = document.getElementById('pair-status');

  sessionCodeEl.textContent = randomSessionCode();
  form.viewDist.value = config.viewDistMm;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = form.pin.value.trim();
    if (pin !== DEMO_PIN) {
      errorEl.textContent = 'Incorrect PIN';
      return;
    }
    const settings = {
      username: form.username.value.trim() || 'guest',
      viewDistMm: parseFloat(form.viewDist.value) || config.viewDistMm,
      protocol: form.protocol.value,
      language: form.language.value,
      sessionCode: sessionCodeEl.textContent,
    };
    config.viewDistMm = settings.viewDistMm;
    overlay.style.display = 'none';
    onEnter(settings);
  });
}
