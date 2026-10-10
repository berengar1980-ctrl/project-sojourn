import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import type { WorldPoint } from '../../core/world-types';
import type { MapCamera } from '../map/map-camera';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  kind: 'smoke' | 'fire' | 'spark';
}
const SOURCES = [
  { x: -0.32, y: -0.17, smoke: 5, fire: false },
  { x: 0.22, y: 0.27, smoke: 5, fire: false },
  { x: 0.05, y: -0.28, smoke: 21, fire: true },
] as const;

/** Particles inherit the instantaneous emitter velocity but thereafter drift independently. */
export class DistressDamageParticles {
  private particles: Particle[] = [];
  private previous: WorldPoint | null = null;
  private elapsed = 0;
  private fade = 1;
  private fading = false;
  private lastTime = 0;
  private readonly emissions = [0, 0, 0];
  private seed = 14752;
  drawScene(
    now: number,
    model: SalvageSpaceViewModel,
    camera: MapCamera,
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    const damaged = model.wrecks.find((wreck) => wreck.id.startsWith('event-wreck-'));
    if (model.sectorEvent?.type !== 'distress-rescue' || !damaged) return;
    if (model.distressRepairing && !this.fading) this.beginExtinguish();
    this.update(
      now,
      model.distressTow?.position ?? damaged.position,
      model.distressTow?.headingRadians ?? damaged.rotation,
      model.ship.nominalLengthMeters,
      camera,
      ctx,
      width,
      height
    );
  }
  beginExtinguish(): void {
    this.fading = true;
  }
  get intensity(): number {
    return this.fade;
  }

  update(
    now: number,
    position: WorldPoint,
    heading: number,
    length: number,
    camera: Pick<MapCamera, 'worldToScreen' | 'scale'>,
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    hullFraction = 0
  ): void {
    const dt = this.lastTime ? Math.max(0, Math.min(0.05, now - this.lastTime)) : 0;
    this.lastTime = now;
    if (!dt) return;
    this.elapsed += dt;
    if (this.fading) this.fade = Math.max(0, this.fade - dt / 5.5);
    const vx = this.previous ? (position.x - this.previous.x) / dt : 0;
    const vy = this.previous ? (position.y - this.previous.y) / dt : 0;
    this.previous = { ...position };
    this.emitSources(now, position, heading, length, dt, vx, vy, hullFraction);
    this.renderParticles(dt, camera, ctx, width, height);
  }

  private emitSources(
    now: number,
    position: WorldPoint,
    heading: number,
    length: number,
    dt: number,
    vx: number,
    vy: number
  ): void {
  const cos = Math.cos(heading),
    sin = Math.sin(heading);
  for (const [i, source] of SOURCES.entries()) {
    const enabled =
      i === 0 ? hullFraction <= 0.85 : i === 2 ? hullFraction <= 0.65 : hullFraction <= 0.25;
    if (!enabled) {
      this.emissions[i] = 0;
      continue;
    }
    const fireActive = source.fire && hullFraction <= 0.45;
    const x = position.x + (source.x * cos - source.y * sin) * length;
    const y = position.y + (source.x * sin + source.y * cos) * length;
    this.emissions[i]! += source.smoke * dt * this.fade;
    while (this.emissions[i]! >= 1) {
      this.emissions[i] = this.emissions[i]! - 1;
      const random = () => {
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
        return this.seed / 4294967296;
      };
      const kind: Particle['kind'] = fireActive && random() < 0.45 ? 'fire' : 'smoke';
      const life = kind === 'fire' ? 0.3 + random() * 0.55 : 1.4 + random() * 2.1;
      this.particles.push({
        x,
        y,
        vx: vx * 0.55 + (random() - 0.5) * 18,
        vy: vy * 0.55 + (random() - 0.5) * 18,
        life,
        maxLife: life,
        radius: kind === 'fire' ? 2.2 : 3.5 + random() * 3,
        kind,
      });
    }
    if (fireActive && this.fade > 0.2 && randomSpark(this.seed++, now, i)) {
      this.particles.push({
        x,
        y,
        vx: vx * 0.55 + Math.cos(now * 13 + i) * 50,
        vy: vy * 0.55 + Math.sin(now * 11 + i) * 50,
        life: 0.5,
        maxLife: 0.5,
        radius: 1.5,
        kind: 'spark',
      });
    }
  }
  }

  private renderParticles(
    dt: number,
    camera: Pick<MapCamera, 'worldToScreen' | 'scale'>,
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
  ctx.save();
  for (const p of this.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-0.19 * dt);
    p.vy *= Math.exp(-0.19 * dt);
    if (p.life <= 0) continue;
    const screen = camera.worldToScreen(p, width, height);
    const progress = 1 - p.life / p.maxLife;
    const radius = camera.scale(p.radius * (1 + progress * (p.kind === 'smoke' ? 2.2 : 0.5)));
    const alpha = Math.min(0.7, p.life / p.maxLife) * (p.kind === 'smoke' ? 0.4 : 0.9);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.kind === 'smoke' ? '#6b7172' : p.kind === 'spark' ? '#ffda86' : '#ff7b2e';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, Math.max(0.4, radius), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  this.particles = this.particles.filter((p) => p.life > 0).slice(-260);
  }
}
function randomSpark(seed: number, now: number, index: number): boolean {
  return Math.abs(Math.sin(seed * 3.7 + now * 5 + index)) > 0.994;
}
