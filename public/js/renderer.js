// Renderer — canvas drawing only. Never touches trial state, networking,
// or input. Takes a plain snapshot of what to draw and paints it.
//
// The marker paints onto its own canvas, layered above the login/pairing
// modal (see index.html's z-index) instead of the same canvas as the dot.
// The phone has to be able to film the marker in its real, unchanged
// position throughout calibration — including while the calibration modal
// is up — so it can't be left on a canvas the modal visually covers.

export class Renderer {
  constructor(canvas, markerCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.markerCanvas = markerCanvas;
    this.markerCtx = markerCanvas.getContext('2d');
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.markerCanvas.width = window.innerWidth;
    this.markerCanvas.height = window.innerHeight;
  }

  get width() {
    return this.canvas.width;
  }

  get height() {
    return this.canvas.height;
  }

  /** state: { dotX, dotY, markerSquares: [{cx,cy,side,color}] } */
  draw(state) {
    const { ctx, canvas } = this;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.arc(state.dotX, state.dotY, DOT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#e8e8e8';
    ctx.fill();

    drawMarkerSquares(this.markerCtx, this.markerCanvas.width, this.markerCanvas.height, state.markerSquares);
  }
}

/** Paints marker squares onto any canvas context — shared by the always-on-top overlay and the calibration-modal preview. */
export function drawMarkerSquares(ctx, width, height, squares) {
  ctx.clearRect(0, 0, width, height);
  for (const sq of squares) {
    ctx.fillStyle = sq.color;
    ctx.fillRect(sq.cx - sq.side / 2, sq.cy - sq.side / 2, sq.side, sq.side);
  }
}

const DOT_RADIUS = 16;
