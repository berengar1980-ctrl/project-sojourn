import type { WorldPoint } from '../../core/world-types';
import { MapCamera, type MapBounds, type ScreenPoint } from '../map/map-camera';
import { CombatCamera } from './combat-camera';

/**
 * MapCamera-compatible adapter backed by the SAME CombatCamera as standalone PvP.
 * Only local-space operation layers need this API; their combat scenes use
 * StrategicCombatRenderer directly.
 */
export class PvPMapCamera extends MapCamera {
  private readonly combat = new CombatCamera();

  constructor(
    private readonly arenaWidth: number,
    private readonly arenaHeight: number
  ) {
    super(arenaWidth, arenaHeight);
  }

  override fit(_viewWidth: number, _viewHeight: number, _bounds?: MapBounds): void {
    this.combat.zoom = 1;
    this.combat.offsetX = 0;
    this.combat.offsetY = 0;
  }

  override updateViewport(_viewWidth: number, _viewHeight: number, _bounds?: MapBounds): void {
    // The CombatCamera projects against live viewport dimensions on each frame.
  }

  override pan(dx: number, dy: number): void {
    this.combat.pan(dx, dy);
  }

  override zoomAt(factor: number, point: ScreenPoint, width: number, height: number): void {
    this.combat.zoomAt(factor, point.x, point.y, width, height);
  }

  override worldToScreen(point: WorldPoint, width: number, height: number): ScreenPoint {
    return this.combat.project(point, width, height, this.arenaWidth, this.arenaHeight);
  }

  override screenToWorld(point: ScreenPoint, width: number, height: number): WorldPoint {
    const zoom = this.combat.zoom;
    return {
      x:
        ((point.x - width / 2 - this.combat.offsetX) / zoom + width / 2 - 70) *
        (this.arenaWidth / Math.max(1, width - 140)),
      y:
        ((point.y - height / 2 - this.combat.offsetY) / zoom + height / 2 - 70) *
        (this.arenaHeight / Math.max(1, height - 140)),
    };
  }

  override scale(value: number): number {
    // Callers provide dimensions through fit/updateViewport before drawing.
    return value * this.lastScale;
  }

  private lastScale = 1;

  /** Update the pixel-per-world-unit projection for operations and hit testing. */
  setViewport(width: number, height: number): void {
    this.lastScale = this.combat.scale(width, height, this.arenaWidth, this.arenaHeight);
  }

  override getZoom(): number {
    return this.lastScale;
  }

  override getRelativeZoom(): number {
    return this.combat.zoom;
  }

  override getCenter(): WorldPoint {
    return this.screenToWorld(
      { x: this.viewWidth / 2, y: this.viewHeight / 2 },
      this.viewWidth,
      this.viewHeight
    );
  }

  private viewWidth = 1;
  private viewHeight = 1;

  setViewDimensions(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    this.setViewport(width, height);
  }
}
