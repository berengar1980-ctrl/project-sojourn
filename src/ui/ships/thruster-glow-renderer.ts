import type { ScreenPoint } from '../map/map-camera';

interface ThrusterGlowOptions {
  readonly center: ScreenPoint;
  readonly radius: number;
  readonly intensity: number;
  readonly flicker: number;
  readonly warmth?: number;
}

export class ThrusterGlowRenderer {
  draw(context: CanvasRenderingContext2D, options: ThrusterGlowOptions): void {
    const intensity = Math.max(0, Math.min(1, options.intensity));
    if (intensity <= 0.01) return;

    const flicker = Math.max(0.72, Math.min(1.25, options.flicker));
    const radius = Math.max(1.5, options.radius * (0.82 + intensity * 0.72) * flicker);
    const alpha = Math.min(0.72, (0.18 + intensity * 0.46) * flicker);
    const warmth = Math.max(0, Math.min(1, options.warmth ?? 0));
    const red = Math.round(168 + warmth * 70);
    const green = Math.round(222 + warmth * 18);
    const blue = Math.round(255 - warmth * 70);

    const gradient = context.createRadialGradient(
      options.center.x,
      options.center.y,
      0,
      options.center.x,
      options.center.y,
      radius
    );
    gradient.addColorStop(0, `rgba(245, 253, 255, ${Math.min(0.96, alpha + 0.2)})`);
    gradient.addColorStop(0.2, `rgba(${red}, ${green}, ${blue}, ${alpha})`);
    gradient.addColorStop(0.58, `rgba(86, 177, 255, ${alpha * 0.28})`);
    gradient.addColorStop(1, 'rgba(60, 140, 255, 0)');

    context.save();
    context.globalCompositeOperation = 'lighter';
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(options.center.x, options.center.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}
