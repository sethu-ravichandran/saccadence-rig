// Renderer — canvas drawing only. Never touches trial state, networking,
// or input. Takes a plain snapshot of what to draw and paints it.

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
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

    for (const sq of state.markerSquares) {
      ctx.fillStyle = sq.color;
      ctx.fillRect(sq.cx - sq.side / 2, sq.cy - sq.side / 2, sq.side, sq.side);
    }
  }
}

const DOT_RADIUS = 16;
