# Eval Round 1 demo script — rig-side (draft for rehearsal, 4:00–4:30)

Goal: show a credible clinic workflow to a calibrated, test-ready state. Do not claim
the saccade algorithm is finished — it isn't, and that's fine.

## Flow + who narrates what

1. **Rig login** (laptop, on screen) — clinician username + PIN gate.
2. **Pair phone** — session code visible on the gate; phone connects, "Waiting for
   phone…" flips to "Paired ✓" live, in front of the jury.
3. **Consent / intake** (phone, app repo) — handed off to whoever demos the Android app.
4. **Calibration screen** (laptop) — marker visibly rendering (green/red guard + free-
   running bit pattern), calibration_start emitted with a laptop timestamp.
5. **Live laptop stimulus + marker** — Space ends calibration → Ready → Space again
   starts a trial → dot steps through the saccade sequence, marker active (green guard),
   target_step events going out with trialId/targetIndex/x/y/laptopTimeMs.
6. **Front-camera recording UI** (phone, app repo) — handed off.
7. **Deterministic sample result / result-template preview** (phone, app repo) —
   handed off — a fixed/mock result screen, not a live-computed one.

## The line to say out loud, verbatim

> "The intake, local-data flow, rig stimulus, marker protocol, and capture UI are live.
> We are currently validating calibration and landmark-derived onset detection."

Say this right after step 5 or 6, before the result-preview screen — it's the pivot
from "here's what's real" to "here's the placeholder," and it should land before a
judge asks the question themselves.

## What NOT to imply

- The result screen is a template/sample, not a computed saccade-latency number.
- Calibration currently gates trial-start (Space) but doesn't yet compute or apply any
  spatial correction — it's a state transition + timestamp, not a completed calibration.
