// StartScreen — clinic-rig demo gate: username + PIN, a few cosmetic settings,
// and a pairing QR/code for the phone. Not real auth — just enough to
// "look real" per the demo-polish pass. Lives entirely in the DOM; nothing
// here touches trial/marker/WS logic beyond announcing the session code it
// generated (via onSessionCode) so main.js can register it with the relay.

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

/**
 * Renders the pairing QR for the given LAN join URL. Uses the vendored
 * qrcode-generator (window.qrcode, loaded as a classic script ahead of this
 * module — see index.html) so the phone can scan instead of hand-typing the
 * six-character code. Falls back silently (code text still shown) if the
 * library failed to load.
 */
function renderPairingQr(el, joinUrl) {
  if (typeof window.qrcode !== 'function') {
    console.log('[pairing] qrcode-generator not loaded, showing code text only');
    return;
  }
  const qr = window.qrcode(0, 'M'); // 0 = auto type-number detection
  qr.addData(joinUrl);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2 });
}

function firstLanUrl(config, sessionCode) {
  // The rig doesn't know its own LAN IP client-side; server.js prints the
  // candidates to its console at boot. The join URL therefore uses
  // location.hostname, which is correct whenever the laptop opened this
  // page via its LAN IP (the documented kiosk launch), and degrades to the
  // bare code (still typeable) if opened via localhost.
  return `ws://${location.hostname}:${location.port}/?join=${sessionCode}`;
}

export function attachStartScreen({ config, onEnter, onSessionCode }) {
  const overlay = document.getElementById('start-screen');
  const form = document.getElementById('start-form');
  const errorEl = document.getElementById('start-error');
  const sessionCodeEl = document.getElementById('session-code');
  const qrEl = document.getElementById('session-qr');
  pairStatusEl = document.getElementById('pair-status');

  const sessionCode = randomSessionCode();
  sessionCodeEl.textContent = sessionCode;
  if (qrEl) renderPairingQr(qrEl, firstLanUrl(config, sessionCode));
  if (onSessionCode) onSessionCode(sessionCode);

  form.viewDist.value = config.viewDistMm;
  form.screenWidth.value = config.screenWidthMm;
  form.protocol.value = config.protocolId;

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
      screenWidthMm: parseFloat(form.screenWidth.value) || config.screenWidthMm,
      protocol: form.protocol.value,
      language: form.language.value,
      sessionCode,
    };
    config.viewDistMm = settings.viewDistMm;
    config.screenWidthMm = settings.screenWidthMm;
    config.protocolId = settings.protocol;
    overlay.style.display = 'none';
    onEnter(settings);
  });
}
