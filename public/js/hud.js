// Hud — the on-screen "visibility of system status" surface during a live
// trial. Before this existed, the only feedback about trial phase lived in
// the devtools console — invisible to a clinician actually watching the
// screen, and the marker had no visible explanation of what it's for.
// Deliberately small and corner-anchored so it informs without turning into
// jury-facing chrome. Reads plain state handed to it; owns no
// trial/canvas/network logic of its own.

import { RigState } from './rigState.js';
import { markerGeometry } from './markerEncoder.js';
import { config } from './config.js';

const PHASE_CONTENT = {
  [RigState.SETUP_CALIBRATION]: {
    title: 'Checking phone camera',
    subtitle: "Point the phone's camera at the marker, bottom-right — press Space once it confirms.",
  },
  [RigState.READY]: {
    title: 'Ready',
    subtitle: 'Press Space to start a trial.',
  },
  [RigState.PRE_CALIBRATION]: {
    title: 'Calibrating — opening',
    subtitle: 'Confirming clock sync with the phone before this trial starts.',
  },
  [RigState.FIXATION]: {
    title: 'Fixation',
    subtitle: 'Patient looks at the center dot.',
  },
  [RigState.SACCADE]: {
    title: 'Saccade',
    subtitle: 'Dot jumps to a new position each step — measures reaction latency.',
  },
  [RigState.PURSUIT]: {
    title: 'Pursuit',
    subtitle: 'Dot sweeps smoothly — measures how well the eye tracks continuous motion.',
  },
  [RigState.POST_CALIBRATION]: {
    title: 'Calibrating — closing',
    subtitle: 'Confirming how much drift happened across this trial.',
  },
  [RigState.COMPLETED]: {
    title: 'Trial complete',
    subtitle: 'Press R to repeat, or continue on the phone for results.',
  },
};

// The phone actually decodes the marker only in these three windows (per
// marker-protocol.md) — everywhere else it's idle and irrelevant, so the
// legend glows only here instead of looking equally "on" all the time.
const MARKER_READ_STATES = new Set([
  RigState.SETUP_CALIBRATION,
  RigState.PRE_CALIBRATION,
  RigState.POST_CALIBRATION,
]);

/** Renders a row of N dots, filling the first `filled` of them — used for saccade step and pursuit pass progress. */
function renderDots(container, total, filled) {
  if (container.childElementCount !== total) {
    container.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      dot.className = 'hud-dot';
      container.appendChild(dot);
    }
  }
  Array.from(container.children).forEach((dot, i) => dot.classList.toggle('filled', i < filled));
}

export function attachHud() {
  const hudEl = document.getElementById('hud');
  const titleEl = document.getElementById('hud-title');
  const subtitleEl = document.getElementById('hud-subtitle');
  const timeEl = document.getElementById('hud-time');
  const sessionEl = document.getElementById('hud-session');
  const progressTrack = document.getElementById('hud-progress-track');
  const progressFill = document.getElementById('hud-progress-fill');
  const stepsEl = document.getElementById('hud-steps');
  const pursuitEl = document.getElementById('hud-pursuit');
  const pursuitArrow = document.getElementById('hud-pursuit-arrow');
  const pursuitLabel = document.getElementById('hud-pursuit-label');
  const legendEl = document.getElementById('shortcut-legend');
  const legendDismiss = document.getElementById('legend-dismiss');
  const phonePill = document.getElementById('phone-pill');
  const markerLegend = document.getElementById('marker-legend');

  // Set true only once the phone's camera has locked the guard marker and
  // the clinician has tapped "Start test" there (the phone_ready message) —
  // overrides the generic setup-calibration subtitle with a live status.
  let markerConfirmed = false;

  // Sit behind the full-screen login/pairing overlay (lower z-index) until
  // it's dismissed — safe to reveal immediately, same pattern as before.
  hudEl.hidden = false;
  legendEl.hidden = false;
  phonePill.hidden = false;
  markerLegend.hidden = false;
  legendDismiss.addEventListener('click', () => {
    legendEl.hidden = true;
  });

  function setSessionInfo({ sessionCode, protocolLabel }) {
    sessionEl.textContent = `Session ${sessionCode} · ${protocolLabel}`;
  }

  function setPhonePaired(paired) {
    phonePill.textContent = paired ? '📱 Paired' : '📱 Phone disconnected';
    phonePill.classList.toggle('warn', !paired);
  }

  function setMarkerConfirmed(confirmed) {
    markerConfirmed = confirmed;
  }

  function setTimingText(text) {
    timeEl.textContent = text;
  }

  /** Positions the "read by phone camera" label above the marker strip, wherever it currently sits. */
  function positionMarkerLegend(canvasWidth, canvasHeight, active) {
    const { side, pitch, guardCenterX, guardCenterY } = markerGeometry(canvasWidth, canvasHeight, config.marker);
    const rowCenterX = guardCenterX + (config.marker.bitCount * pitch) / 2;
    markerLegend.style.left = `${rowCenterX}px`;
    markerLegend.style.top = `${guardCenterY - side - 22}px`;
    markerLegend.classList.toggle('active', active);
  }

  function update(state) {
    const content = PHASE_CONTENT[state.state] ?? { title: state.state, subtitle: '' };
    let title = content.title;
    let subtitle = content.subtitle;

    if (state.state === RigState.SETUP_CALIBRATION && markerConfirmed) {
      subtitle = 'Marker confirmed by phone ✓ — press Space to end calibration.';
    }

    progressTrack.hidden = true;
    stepsEl.hidden = true;
    pursuitEl.hidden = true;

    if (state.state === RigState.SACCADE && state.totalSteps) {
      title += ` — step ${state.stepIndex} of ${state.totalSteps}`;
      stepsEl.hidden = false;
      renderDots(stepsEl, state.totalSteps, state.stepIndex);
    } else if (state.state === RigState.PURSUIT && state.totalPursuitPasses) {
      title += ` — pass ${state.pursuitPassIndex + 1} of ${state.totalPursuitPasses}`;
      pursuitEl.hidden = false;
      pursuitArrow.textContent = state.pursuitDirection === -1 ? '←' : '→';
      pursuitLabel.textContent = `${state.pursuitPassIndex + 1} / ${state.totalPursuitPasses}`;
    } else if (
      state.phaseDurationMs &&
      (state.state === RigState.PRE_CALIBRATION ||
        state.state === RigState.FIXATION ||
        state.state === RigState.POST_CALIBRATION)
    ) {
      const elapsed = performance.now() - state.phaseStartMs;
      const pct = Math.min(100, Math.max(0, (elapsed / state.phaseDurationMs) * 100));
      progressTrack.hidden = false;
      progressFill.style.width = `${pct}%`;
    }

    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;

    if (state.canvasWidth && state.canvasHeight) {
      positionMarkerLegend(state.canvasWidth, state.canvasHeight, MARKER_READ_STATES.has(state.state));
    }
  }

  return { update, setSessionInfo, setPhonePaired, setMarkerConfirmed, setTimingText };
}
