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
    const worldScale = this.scale(width, height, worldWidth, worldHeight);
    return {
      x: width / 2 + (point.x - worldWidth / 2) * worldScale + this.offsetX,
      y: height / 2 + (point.y - worldHeight / 2) * worldScale + this.offsetY,
    };
  }

  pan(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  zoomAt(factor: number, x: number, y: number, width: number, height: number): void {
    const next = Math.max(1, Math.min(4.6, this.zoom * factor));
    const ratio = next / this.zoom;
    this.offsetX = x - width / 2 - (x - width / 2 - this.offsetX) * ratio;
    this.offsetY = y - height / 2 - (y - height / 2 - this.offsetY) * ratio;
    this.zoom = next;
  }
}
