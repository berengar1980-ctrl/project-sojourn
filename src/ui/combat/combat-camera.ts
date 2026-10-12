export interface CombatViewportPoint {
  readonly x: number;
  readonly y: number;
}

export class CombatCamera {
  zoom = 1;
  offsetX = 0;
  offsetY = 0;

  scale(width: number, height: number, worldWidth: number, worldHeight: number): number {
    return (
      Math.min(Math.max(1, width - 140) / worldWidth, Math.max(1, height - 140) / worldHeight) *
      this.zoom
    );
  }

  project(
    point: CombatViewportPoint,
    width: number,
    height: number,
    worldWidth: number,
    worldHeight: number
  ): CombatViewportPoint {
    const baseX = 70 + (point.x / worldWidth) * (width - 140);
    const baseY = 70 + (point.y / worldHeight) * (height - 140);
    return {
      x: width / 2 + (baseX - width / 2) * this.zoom + this.offsetX,
      y: height / 2 + (baseY - height / 2) * this.zoom + this.offsetY,
    };
  }

  pan(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  zoomAt(factor: number, x: number, y: number, width: number, height: number): void {
    const next = Math.max(0.5, Math.min(5, this.zoom * factor));
    const ratio = next / this.zoom;
    this.offsetX = x - width / 2 - (x - width / 2 - this.offsetX) * ratio;
    this.offsetY = y - height / 2 - (y - height / 2 - this.offsetY) * ratio;
    this.zoom = next;
  }
}
