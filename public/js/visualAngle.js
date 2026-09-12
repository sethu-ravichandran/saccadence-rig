// visualAngle — AUTHORITATIVE geometry (re-promoted per the mandatory
// implementation plan). Saccade step amplitude and pursuit sweep velocity
// are both commanded in true visual degrees for the configured screen width
// and viewing distance; pursuit gain is fitted against the commanded
// deg/s, so this conversion is on the critical measurement path.

export function degToPx(deg, canvasWidth, screenWidthMm, viewDistMm) {
  const pxPerMm = canvasWidth / screenWidthMm;
  const rad = (deg * Math.PI) / 180;
  return 2 * viewDistMm * Math.tan(rad / 2) * pxPerMm;
}
