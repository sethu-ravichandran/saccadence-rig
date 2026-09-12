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

## Session control (relay-internal, never forwarded to the other peer)

The relay (`server/wsRelay.js`) scopes every other message to clients paired into the
same session, so "commands affect only the paired phone/rig session":

```
→ register_rig  { sessionCode }              // rig sends once per connect/reconnect
→ join          { sessionCode }              // phone sends after scanning/typing the code
← join_ack      { ok, reason? }              // reason present only when ok:false
← peer_count    { count }                    // broadcast to a session on membership change
```

## Wire messages

```
→ start_trial   { subject_id }
→ next_target   { x, y, t_planned_ms }
→ stop          {}
```

## Orchestration events the rig emits

These are separate from the marker itself (still camera-only, per above) — they're
timestamped WS broadcasts so Android can correlate its own clock/frames to laptop-side
state changes. `laptopTimeMs` is `performance.now()` (monotonic, page-load-relative),
not a wall-clock epoch — offset/jitter/drift math from these numbers is entirely the
phone's responsibility; the rig only sequences and labels.

Every trial carries its own calibration bracket — a `role: 'pre'` pair immediately
before the trial's blocks and a `role: 'post'` pair immediately after, both tagged with
the same `trialId` so the phone can pair them:

```
← calibration_start  { role: 'setup' | 'pre' | 'post', trialId?, laptopTimeMs }
← calibration_stop   { role: 'setup' | 'pre' | 'post', trialId?, laptopTimeMs }
```

(`role: 'setup'` has no `trialId` — it's the one-time session-start marker check, not
part of a trial's bracket.)

```
← trial_config   { trialId, protocolId, screenWidthMm, viewDistMm, stepDegrees, pursuit, laptopTimeMs }
← block_start    { block: 'fixation' | 'saccade' | 'pursuit', trialId, laptopTimeMs }
← block_end      { block: 'fixation' | 'saccade' | 'pursuit', trialId, laptopTimeMs }
← target_step    { trialId, targetIndex, stepAmplitudeDeg, x, y, laptopTimeMs }
← sweep_start    { trialId, passIndex, direction, amplitudeDeg, commandedVelocityDegPerSec, laptopTimeMs }
← sweep_end      { trialId, passIndex, direction, laptopTimeMs }
```

`target_step` fires once per dot placement during the saccade block — index 0 is the
initial center dot, indices 1..N follow the protocol's `stepDegrees`; `stepAmplitudeDeg`
is `null` for index 0 and the commanded step angle otherwise. `sweep_start`/`sweep_end`
bracket one constant-velocity pursuit pass; per-frame dot position during a sweep is
never put on the wire — only the commanded velocity and direction are, since the phone
fits measured eye velocity against the *commanded* value, not against a live position
feed.
