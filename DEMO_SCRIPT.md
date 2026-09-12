# Eval Round demo script — rig-side (draft for rehearsal)

Goal: show the full mandatory-per-plan clinic workflow, driven through Office Kit,
end to end on the rig side. This script covers only what the rig itself does; app-repo
steps are marked "handed off."

## Flow + who narrates what

1. **Rig login** (laptop, on screen) — clinician username + PIN gate, driven from
   Office Kit's remote control.
2. **Pair phone** — session code and pairing QR visible on the gate; phone scans/joins,
   "Waiting for phone…" flips to "Paired ✓" live, in front of the jury. The relay only
   forwards messages within a joined session — a wrong code is rejected.
3. **Consent / intake** (phone, app repo) — handed off to whoever demos the Android app.
4. **Session-start calibration** (laptop) — marker visibly rendering (green/red guard +
   free-running bit pattern) at session start; `calibration_start`/`calibration_stop`
   (`role: 'setup'`) emitted with laptop timestamps. Space (via Office Kit) ends it → Ready.
5. **Select protocol** — `1` on Office Kit selects the full saccade+pursuit protocol,
   `2` selects saccade-only; selection is visible in the console and included in
   every trial's `trial_config` event.
6. **Live trial, driven entirely from Office Kit** — Space starts a trial:
   - opening (`pre`) calibration bracket, marker active,
   - fixation baseline,
   - saccade step block — dot steps through the sequence at true visual angle,
     `target_step` events carrying `trialId`/`targetIndex`/`stepAmplitudeDeg`/`x`/`y`/`laptopTimeMs`,
   - pursuit sweep block (full protocol only) — constant-velocity passes,
     `sweep_start`/`sweep_end` events carrying the commanded velocity and direction,
   - closing (`post`) calibration bracket, marker active again, closing the trial's bracket.
   `R` repeats a trial; `Esc` stops at any point in the bracket and returns to Ready.
7. **Back-camera recording UI** (phone, app repo) — handed off.
8. **Results screen** (phone, app repo) — handed off — reports latency, pursuit gain,
   the itemised error budget (including measured drift across the bracket), and a
   Gemma-drafted clinic note.

## What to say about Office Kit, unprompted

> Office Kit is driving this rig end to end — login, protocol selection, and the
> full trial sequence are all Office Kit remote-control input. It's not decorative.

## What NOT to imply

- The rig only sequences and timestamps; offset/jitter/drift computation and every
  measured value live entirely on the phone. Don't describe the rig itself as computing
  a latency or gain number.
- The pairing QR is a convenience for the six-character session code, not a security
  mechanism — say "session code" if asked what secures pairing, not "encrypted."
