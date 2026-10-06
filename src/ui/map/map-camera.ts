import type { WorldPoint } from '../../core/world-types';

const MAX_RELATIVE_ZOOM = 4.6;
const MIN_RELATIVE_ZOOM = 0.96;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface MapBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export class MapCamera {
  private x = 0;
  private y = 0;
  private zoom = 1;
  private minimumZoom = 0.25;
  private maximumZoom = 4;
  private fitZoom = 1;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number
  ) {}

  fit(viewWidth: number, viewHeight: number, bounds?: MapBounds): void {
    const padding = 72;
    const minX = bounds?.minX ?? 0;
    const minY = bounds?.minY ?? 0;
    const maxX = bounds?.maxX ?? this.worldWidth;
    const maxY = bounds?.maxY ?? this.worldHeight;
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const fitZoom = Math.min(
      (viewWidth - padding) / contentWidth,
      (viewHeight - padding) / contentHeight
    );

    this.fitZoom = Math.max(0.12, fitZoom);
    this.zoom = this.fitZoom;
    this.minimumZoom = this.fitZoom * MIN_RELATIVE_ZOOM;
    this.maximumZoom = this.fitZoom * MAX_RELATIVE_ZOOM;
    this.x = (minX + maxX) / 2;
    this.y = (minY + maxY) / 2;
  }

  pan(screenDx: number, screenDy: number): void {
    this.x -= screenDx / this.zoom;
    this.y -= screenDy / this.zoom;
  }

  zoomAt(factor: number, screen: ScreenPoint, viewWidth: number, viewHeight: number): void {
    const before = this.screenToWorld(screen, viewWidth, viewHeight);
    this.zoom = Math.min(this.maximumZoom, Math.max(this.minimumZoom, this.zoom * factor));
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

  getZoom(): number {
    return this.zoom;
  }

  getRelativeZoom(): number {
    return this.zoom / this.fitZoom;
  }

  getCenter(): WorldPoint {
    return { x: this.x, y: this.y };
  }
}
