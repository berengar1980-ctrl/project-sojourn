import type { WorldPoint } from '../../core/world-types';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export class MapCamera {
  private x = 0;
  private y = 0;
  private zoom = 1;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number
  ) {}

  fit(viewWidth: number, viewHeight: number): void {
    const padding = 80;
    this.zoom = Math.min(
      (viewWidth - padding) / this.worldWidth,
      (viewHeight - padding) / this.worldHeight
    );
    this.zoom = Math.max(0.25, this.zoom);
    this.x = this.worldWidth / 2;
    this.y = this.worldHeight / 2;
  }

  pan(screenDx: number, screenDy: number): void {
    this.x -= screenDx / this.zoom;
    this.y -= screenDy / this.zoom;
  }

  zoomAt(factor: number, screen: ScreenPoint, viewWidth: number, viewHeight: number): void {
    const before = this.screenToWorld(screen, viewWidth, viewHeight);
    this.zoom = Math.min(2.5, Math.max(0.35, this.zoom * factor));
    const after = this.screenToWorld(screen, viewWidth, viewHeight);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  worldToScreen(point: WorldPoint, viewWidth: number, viewHeight: number): ScreenPoint {
    return {
      x: (point.x - this.x) * this.zoom + viewWidth / 2,
      y: (point.y - this.y) * this.zoom + viewHeight / 2,
    };
  }

  screenToWorld(point: ScreenPoint, viewWidth: number, viewHeight: number): WorldPoint {
    return {
      x: (point.x - viewWidth / 2) / this.zoom + this.x,
      y: (point.y - viewHeight / 2) / this.zoom + this.y,
    };
  }

  scale(value: number): number {
    return value * this.zoom;
  }
}
