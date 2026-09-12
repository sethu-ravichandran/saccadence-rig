// StartScreen — clinic-rig demo gate, structured as a 4-step wizard: pair
// device -> sign in -> session setup -> calibrating phase. Each step is one
// concern with its own "Continue" (or, for calibration, an external
// confirmation), instead of one form doing pairing/auth/config/calibration
// at once — pairing's Continue is disabled until a phone joins and
// calibration only closes once the phone confirms marker lock, so both
// preconditions are structural rather than something the clinician has to
// remember to check. Not real auth — just enough to "look real" per the
// demo-polish pass. Lives entirely in the DOM; nothing here touches
// trial/marker/WS logic beyond announcing the session code it generated
// (via onSessionCode) and starting calibration (via onCalibrate) so main.js
// can wire those into the relay/TrialController.

const DEMO_PIN = '1234';
const PROTOCOL_LABELS = {
  'full-90s': 'Full Protocol — saccade + pursuit (~90s)',
  'saccade-latency-10step': 'Saccade Latency only (10-step)',
};

function randomSessionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

let pairStatusEl = null;
let pairContinueBtn = null;
let isPaired = false;
let overlayEl = null;
let calibStatusEl = null;

const CALIB_WAITING_TEXT = "Point the phone's camera at the marker, bottom-right — waiting for it to confirm lock…";
const CALIB_CONFIRMED_TEXT = 'Marker confirmed by phone ✓ — closing calibration screen…';

/** Called from main.js on every peer_count WS message — count includes this rig tab itself. */
export function setPaired(count) {
  isPaired = count > 1;
  if (pairStatusEl) {
    pairStatusEl.textContent = isPaired ? 'Paired ✓' : 'Waiting for phone…';
    pairStatusEl.style.color = isPaired ? '#4ade80' : '#9a9aa4';
  }
  if (pairContinueBtn) pairContinueBtn.disabled = !isPaired;
}

/**
 * Called from main.js on `phone_ready` — the phone only sends that once its
 * camera has locked onto the guard marker. The calibration screen (step 4)
 * stays up until this fires, then closes so the trial can begin; Space
 * still has to be pressed to actually launch it, unchanged.
 */
export function setCalibrationConfirmed(confirmed) {
  if (calibStatusEl) calibStatusEl.textContent = confirmed ? CALIB_CONFIRMED_TEXT : CALIB_WAITING_TEXT;
  if (confirmed && overlayEl) overlayEl.style.display = 'none';
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

function firstLanUrl(sessionCode) {
  // The rig doesn't know its own LAN IP client-side; server.js prints the
  // candidates to its console at boot. The join URL therefore uses
  // location.hostname, which is correct whenever the laptop opened this
  // page via its LAN IP (the documented kiosk launch), and degrades to the
  // bare code (still typeable) if opened via localhost.
  return `ws://${location.hostname}:${location.port}/?join=${sessionCode}`;
}

function showStep(stepEl, allSteps) {
  for (const el of allSteps) el.hidden = el !== stepEl;
  const target = Number(stepEl.dataset.step);
  document.querySelectorAll('.progress .dot').forEach((d) => {
    d.classList.toggle('active', Number(d.dataset.step) === target);
  });
}

export function attachStartScreen({ config, onCalibrate, onSessionCode }) {
  const overlay = document.getElementById('start-screen');
  overlayEl = overlay;
  const stepPair = document.getElementById('step-pair');
  const stepLogin = document.getElementById('step-login');
  const stepSetup = document.getElementById('step-setup');
  const stepCalibrate = document.getElementById('step-calibrate');
  const allSteps = [stepPair, stepLogin, stepSetup, stepCalibrate];

  const sessionCodeEl = document.getElementById('session-code');
  const qrEl = document.getElementById('session-qr');
  pairStatusEl = document.getElementById('pair-status');
  pairContinueBtn = document.getElementById('pair-continue');
  calibStatusEl = document.getElementById('calib-status-text');

  const loginForm = document.getElementById('login-form');
  const errorEl = document.getElementById('start-error');
  const pinInput = document.getElementById('field-pin');
  const pinToggle = document.getElementById('pin-toggle');

  const setupForm = document.getElementById('setup-form');
  const protocolCards = Array.from(document.querySelectorAll('.protocol-card'));
  let selectedProtocol = config.protocolId;

  const sessionCode = randomSessionCode();
  sessionCodeEl.textContent = sessionCode;
  if (qrEl) renderPairingQr(qrEl, firstLanUrl(sessionCode));
  if (onSessionCode) onSessionCode(sessionCode);

  // ---- step 1: pair -------------------------------------------------------
  pairContinueBtn.addEventListener('click', () => {
    if (!isPaired) return;
    showStep(stepLogin, allSteps);
    document.getElementById('field-username').focus();
  });

  // ---- step 2: sign in -----------------------------------------------------
  pinToggle.addEventListener('click', () => {
    const willShow = pinInput.type === 'password';
    pinInput.type = willShow ? 'text' : 'password';
    pinToggle.textContent = willShow ? 'Hide' : 'Show';
    pinToggle.setAttribute('aria-label', willShow ? 'Hide PIN' : 'Show PIN');
  });

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = loginForm.pin.value.trim();
    if (pin !== DEMO_PIN) {
      errorEl.textContent = 'Incorrect PIN. Please try again.';
      pinInput.focus();
      return;
    }
    errorEl.textContent = '';
    showStep(stepSetup, allSteps);
  });

  // ---- step 3: session setup ------------------------------------------------
  setupForm.viewDist.value = config.viewDistMm;
  setupForm.screenWidth.value = config.screenWidthMm;
  protocolCards.forEach((card) => card.setAttribute('aria-checked', String(card.dataset.value === selectedProtocol)));

  protocolCards.forEach((card) => {
    card.addEventListener('click', () => {
      selectedProtocol = card.dataset.value;
      protocolCards.forEach((c) => c.setAttribute('aria-checked', String(c === card)));
    });
  });

  setupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const settings = {
      username: loginForm.username.value.trim() || 'guest',
      viewDistMm: parseFloat(setupForm.viewDist.value) || config.viewDistMm,
      screenWidthMm: parseFloat(setupForm.screenWidth.value) || config.screenWidthMm,
      protocol: selectedProtocol,
      protocolLabel: PROTOCOL_LABELS[selectedProtocol] ?? selectedProtocol,
      sessionCode,
    };
    config.viewDistMm = settings.viewDistMm;
    config.screenWidthMm = settings.screenWidthMm;
    config.protocolId = settings.protocol;
    // Overlay stays up — step 4 (calibrating phase) takes over next, and
    // only closes once the phone actually confirms marker lock.
    showStep(stepCalibrate, allSteps);
    calibStatusEl.textContent = CALIB_WAITING_TEXT;
    onCalibrate(settings);
  });
}
