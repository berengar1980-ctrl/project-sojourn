import type { PortLocationVisualView } from '../../features/port/port-view-model';
import { PlanetRingRenderer } from '../map/planet-ring-renderer';
import { StationSymbolRenderer } from '../map/station-symbol-renderer';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';

export class PortLocationRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly spaceBodies: ProceduralSpaceBodyRenderer;
  private readonly planetRings: PlanetRingRenderer;
  private readonly stationSymbols: StationSymbolRenderer;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly visual: PortLocationVisualView
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Docked location canvas unavailable.');

    this.context = context;
    this.spaceBodies = new ProceduralSpaceBodyRenderer(context);
    this.planetRings = new PlanetRingRenderer(context);
    this.stationSymbols = new StationSymbolRenderer(context);
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw(rect.width, rect.height);
  }

  private draw(width: number, height: number): void {
    this.context.clearRect(0, 0, width, height);

    const point = { x: width * 0.5, y: height * 0.43 };
    if (this.visual.kind === 'station') {
      const radius = Math.min(48, Math.max(30, Math.min(width, height) * 0.22));
      this.stationSymbols.draw(this.visual.stationType ?? 'utility', point, radius);
      return;
    }

    if (this.visual.kind !== 'planet' && this.visual.kind !== 'moon') return;

    const maxForRings = this.visual.ringStyle ? width / 4.15 : width / 2.7;
    const radius = Math.min(64, Math.max(38, Math.min(height * 0.3, maxForRings)));

    if (this.visual.ringStyle) {
      this.planetRings.drawBack(this.visual.ringStyle, this.visual.id, point, radius);
    }
    this.spaceBodies.drawPlanet({
      id: this.visual.id,
      x: point.x,
      y: point.y,
      radius,
      dangerLevel: this.visual.dangerLevel,
      biome: this.visual.planetBiome ?? 'temperate',
      light: this.visual.light,
    });
    if (this.visual.ringStyle) {
      this.planetRings.drawFront(this.visual.ringStyle, point, radius);
    }
  }
}
