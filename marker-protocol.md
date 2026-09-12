# Marker protocol — canonical spec

**Source of truth: `MarkerDecoder.kt` in `saccadence-app`** (commit `7f56fc6`). This file
mirrors that implementation — if they ever disagree, the Kotlin decoder wins and this file
is wrong, not the other way around.

## Geometry

A horizontal strip of 9 solid-filled squares in the laptop screen's bottom-right area:
one **guard square**, followed by **8 bit squares**, left to right.

- Square side = **2.2%** of `min(canvasWidth, canvasHeight)`
- Gap between squares = **0.6%** of `min(canvasWidth, canvasHeight)`
- Pitch (center-to-center) = `side * (1 + 0.6/2.2)` = `side * 1.2727...`
- Bit square `i` (0-indexed from the guard, `i` in `0..7`) is centered at
  `guardCenterX + (i + 1) * pitch`, same `y` as the guard.
- The decoder searches the bottom-right **35% × 35%** of the *camera frame* — render the
  whole strip inset from the laptop screen's right/bottom edges (this build uses a 2% margin)
  so it survives imperfect phone framing. Expect to tune the margin once Sethu points a real
  camera at it (Red Light robustness pass).

## Colors — solid fills only, no gradients or anti-aliasing softness

The decoder classifies by BT.601 chroma distance, not RGB, so these have to be pure:

| Element | State | Color |
|---|---|---|
| Guard | trial active | `rgb(0, 255, 0)` |
| Guard | idle | `rgb(255, 0, 0)` |
| Bit = 1 | | `rgb(255, 255, 255)` |
| Bit = 0 | | `rgb(0, 0, 0)` |

## Frame ID

An 8-bit counter, **free-running continuously**, incrementing once per rendered frame,
wrapping `255 → 0`. Bit 0 (closest to the guard) is the **MSB**; bit 7 (farthest) is the
**LSB** — matches `MarkerDecoderTest.kt`'s `drawMarker` helper exactly:

```
shift = 7 - bitIndex        // bitIndex 0..7
isOne = (frameId >> shift) & 1
```

Runs regardless of guard color — the decoder's own idle-marker test still expects a valid
`frameId` when the guard reads red.

## What's explicitly NOT on the wire

No WebSocket message carries marker state or timing. The phone reads `active` and `frameId`
directly off the video, every frame, on its own clock. The WS channel is orchestration only
(`start_trial` / `next_target` / `stop`) — it could be arbitrarily delayed and no measurement
would be affected.

## Wire messages (unchanged from earlier, minus the now-pointless `marker_state` echo)

```
→ start_trial   { subject_id }
→ next_target   { x, y, t_planned_ms }
→ stop          {}
```

## Orchestration events the rig emits (added for calibration + target correlation)

These are separate from the marker itself (still camera-only, per above) — they're
timestamped WS broadcasts so Android can correlate its own clock/frames to laptop-side
state changes. `laptopTimeMs` is `performance.now()` (monotonic, page-load-relative),
not a wall-clock epoch — offset calculation against Android's clock is NOT solved yet,
this just gets the raw numbers on the wire.

```
← calibration_start  { laptopTimeMs }
← calibration_stop   { laptopTimeMs }
← target_step        { trialId, targetIndex, x, y, laptopTimeMs }
```

`target_step` fires once per dot placement during a running trial — index 0 is the
initial center dot, indices 1..N follow `config.stepDegrees`.
