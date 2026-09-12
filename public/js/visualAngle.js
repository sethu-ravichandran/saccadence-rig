// visualAngle — NOT on the critical path (Path-to-100 cuts visual-angle
// calibration entirely; latency is a frame count). Kept as a harmless,
// non-blocking bonus for the deck's roadmap slide. Nothing else in this
// app depends on this being accurate.

export function degToPx(deg, canvasWidth, screenWidthMm, viewDistMm) {
  const pxPerMm = canvasWidth / screenWidthMm;
  const rad = (deg * Math.PI) / 180;
  return 2 * viewDistMm * Math.tan(rad / 2) * pxPerMm;
}
