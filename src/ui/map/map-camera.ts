import type { WorldPoint } from '../../core/world-types';

const MAX_RELATIVE_ZOOM = 4.6;
const MIN_RELATIVE_ZOOM = 1;

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
    const fitZoom = this.calculateFitZoom(viewWidth, viewHeight, bounds);
    const { minX, minY, maxX, maxY } = this.resolveBounds(bounds);

    this.applyZoomLimits(fitZoom, 1);
    this.x = (minX + maxX) / 2;
    this.y = (minY + maxY) / 2;
  }

  updateViewport(viewWidth: number, viewHeight: number, bounds?: MapBounds): void {
    const relativeZoom = Math.min(
      MAX_RELATIVE_ZOOM,
      Math.max(MIN_RELATIVE_ZOOM, this.getRelativeZoom())
    );
    this.applyZoomLimits(this.calculateFitZoom(viewWidth, viewHeight, bounds), relativeZoom);
  }

  private resolveBounds(bounds?: MapBounds): MapBounds {
    return {
      minX: bounds?.minX ?? 0,
      minY: bounds?.minY ?? 0,
      maxX: bounds?.maxX ?? this.worldWidth,
      maxY: bounds?.maxY ?? this.worldHeight,
    };
  }

  private calculateFitZoom(viewWidth: number, viewHeight: number, bounds?: MapBounds): number {
    const padding = 72;
    const { minX, minY, maxX, maxY } = this.resolveBounds(bounds);
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const fitZoom = Math.min(
      Math.max(1, viewWidth - padding) / contentWidth,
      Math.max(1, viewHeight - padding) / contentHeight
    );
    return Math.max(0.12, fitZoom);
  }

  private applyZoomLimits(fitZoom: number, relativeZoom: number): void {
    this.fitZoom = fitZoom;
    this.minimumZoom = fitZoom * MIN_RELATIVE_ZOOM;
    this.maximumZoom = fitZoom * MAX_RELATIVE_ZOOM;
    this.zoom = Math.min(
      this.maximumZoom,
      Math.max(this.minimumZoom, fitZoom * relativeZoom)
    );
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
