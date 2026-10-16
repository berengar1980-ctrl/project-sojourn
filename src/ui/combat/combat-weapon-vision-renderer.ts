import type { ShipWeaponFamily } from '../../core/ship-types';
import {
  VISION_IMPACT_SECONDS,
  VISION_PULSE_SECONDS,
  VISION_ION_LASER_SECONDS,
} from '../../core/combat-visual-timings';
import { autocannonTracers, type WeaponFxPoint } from './combat-weapon-fx-renderer';

/** Visual-only reinterpretations approved from the HTML weapon laboratory. */
const TAU = Math.PI * 2;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const blend = (a: number, b: number, t: number): number => a + (b - a) * t;
const noise = (seed: number): number => {
  const value = Math.sin(seed * 103.71 + 37.914) * 43758.5453123;
  return value - Math.floor(value);
};
const along = (from: WeaponFxPoint, to: WeaponFxPoint, t: number): WeaponFxPoint => ({
  x: blend(from.x, to.x, t),
  y: blend(from.y, to.y, t),
});

function stroke(
  ctx: CanvasRenderingContext2D,
  from: WeaponFxPoint,
  to: WeaponFxPoint,
  color: string,
  width: number,
  alpha: number,
  glow = 0
): void {
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function circle(
  ctx: CanvasRenderingContext2D,
  point: WeaponFxPoint,
  radius: number,
  color: string,
  alpha: number,
  glow = 0,
  outline = false,
  width = 1
): void {
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, TAU);
  if (outline) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

/** Three independent coral-red needles, replacing the blue pulse beam. */
export function drawVisionPulseLaser(
  ctx: CanvasRenderingContext2D,
  from: WeaponFxPoint,
  to: WeaponFxPoint,
  ageSeconds: number
): void {
  if (ageSeconds < 0 || ageSeconds >= VISION_PULSE_SECONDS) return;
  for (let index = 0; index < 3; index += 1) {
    const progress = (ageSeconds - index * 0.085) / 0.24;
    if (progress < 0 || progress > 1) continue;
    const head = along(from, to, progress);
    const wideTail = along(from, to, Math.max(0, progress - 0.068));
    const coreTail = along(from, to, Math.max(0, progress - 0.049));
    stroke(ctx, wideTail, head, index === 1 ? '#ffd9bc' : '#ff817c', 3.4, 1 - progress * 0.4, 9);
    stroke(ctx, coreTail, head, '#fff6e5', 1, 1, 3);
    circle(ctx, from, 3.5 + index * 0.5, '#ffbda9', 0.6 * (1 - progress), 11);
  }
}

/** Ion laser uses the user's selected *Ion Cannon interpretation* (not its old fiber design). */
export function drawVisionIonLaser(
  ctx: CanvasRenderingContext2D,
  from: WeaponFxPoint,
  to: WeaponFxPoint,
  ageSeconds: number,
  seed: number
): void {
  if (ageSeconds < 0 || ageSeconds >= VISION_ION_LASER_SECONDS) return;
  const progress = ageSeconds / VISION_ION_LASER_SECONDS;
  const end = along(from, to, clamp01(progress / 0.12));
  const fade = Math.pow(1 - progress, 1.4);
  stroke(ctx, from, end, '#48eacb', 8, fade * 0.17, 22);
  stroke(ctx, from, end, '#8cffe9', 3.3, fade * 0.53, 12);
  stroke(ctx, from, end, '#f1ffff', 1, fade * 0.95, 5);
  for (let index = 0; index < 14; index += 1) {
    const t = (index + 1) / 15;
    const center = along(from, end, t);
    const bend = 7 + 5 * Math.sin(index * 1.6 + ageSeconds * 27);
    const phase = Math.sin(index * 4 + ageSeconds * 27 + seed);
    stroke(
      ctx,
      { x: center.x, y: center.y - bend * (1 + phase * 0.25) },
      { x: center.x, y: center.y + bend * (1 - phase * 0.25) },
      '#c3fff7',
      0.85,
      fade * 0.53,
      5
    );
  }
  for (let index = 0; index < 3; index += 1) {
    circle(ctx, from, 6 + index * 5 + progress * 24, '#a3fff4', fade * 0.36, 7, true, 0.95);
  }
}

/** Plasma and missiles stay on their actual simulated positions and headings. */
/** Internal plasma body: uses the unchanged shapes and palette. */
function drawPlasmaProjectileBody(
  ctx: CanvasRenderingContext2D,
  elapsedSeconds: number,
  seed: number
): void {
  const pulse = 1 + Math.sin(elapsedSeconds * 24 + seed) * 0.17;
  for (let index = 8; index >= 0; index -= 1) {
    circle(ctx, { x: -index * 3.8, y: 0 }, 2 + index * 0.36, '#e8668e', (1 - index / 10) * 0.27, 8);
  }
  circle(ctx, { x: 0, y: 0 }, 9 * pulse, '#df6bba', 0.35, 24);
  circle(ctx, { x: 0, y: 0 }, 7 * pulse, '#fa9b5b', 0.68, 15);
  circle(ctx, { x: 0, y: 0 }, 4.6 * pulse, '#fff1c1', 0.96, 10);
  for (let index = 0; index < 8; index += 1) {
    const a = (index * TAU) / 8 + elapsedSeconds * (index % 2 ? 2 : -1);
    const radius = 7 + 4 * Math.sin(elapsedSeconds * 9 + index);
    circle(
      ctx,
      { x: Math.cos(a) * radius, y: Math.sin(a) * radius },
      0.65 + (index % 3) * 0.45,
      '#ffdbba',
      0.58,
      4
    );
  }
}

/** Internal missile body: same guided/HE silhouettes and exhaust. */
function drawMissileProjectileBody(
  ctx: CanvasRenderingContext2D,
  family: ShipWeaponFamily,
  elapsedSeconds: number
): void {
  const guided = family === 'guided_missile';
  const body = guided ? '#ced9c8' : '#6e5550';
  const edge = guided ? '#7ba58f' : '#ea9877';
  for (let index = 1; index <= (guided ? 8 : 13); index += 1) {
    const alpha = Math.max(0.04, (1 - index / (guided ? 10 : 14)) * 0.55);
    circle(
      ctx,
      { x: -9 - index * (guided ? 3.1 : 3.5), y: Math.sin(elapsedSeconds * 7 + index) * 0.8 },
      Math.max(0.4, 2.2 + index * (guided ? -0.16 : 0.22)),
      guided ? (index % 3 ? '#81ddad' : '#e8ffdc') : index % 3 ? '#fd864f' : '#86817f',
      alpha,
      8
    );
  }
  ctx.fillStyle = body;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(3, guided ? -2.3 : -3.3);
  ctx.lineTo(-9, guided ? -1.8 : -3);
  ctx.lineTo(-11, 0);
  ctx.lineTo(-9, guided ? 1.8 : 3);
  ctx.lineTo(3, guided ? 2.3 : 3.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (!guided) {
    ctx.fillStyle = '#c79b8e';
    ctx.fillRect(-5, -1, 9, 2);
  }
  circle(ctx, { x: -11, y: 0 }, guided ? 1.5 : 2, guided ? '#8debc4' : '#ffb65b', 0.85, 10);
}

/** Plasma and missiles stay on their actual simulated positions and headings. */
export function drawVisionProjectile(
  ctx: CanvasRenderingContext2D,
  family: ShipWeaponFamily,
  point: WeaponFxPoint,
  direction: WeaponFxPoint,
  elapsedSeconds: number,
  seed: number
): boolean {
  if (!['plasma_battery', 'guided_missile', 'he_missile'].includes(family)) return false;
  const angle = Math.atan2(direction.y, direction.x);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle);
  if (family === 'plasma_battery') {
    drawPlasmaProjectileBody(ctx, elapsedSeconds, seed);
  } else {
    drawMissileProjectileBody(ctx, family, elapsedSeconds);
  }
  ctx.restore();
  return true;
}

/** Seven copper tracer streaks; still exactly one gameplay shot / damage event. */
export function drawVisionAutocannon(
  ctx: CanvasRenderingContext2D,
  from: WeaponFxPoint,
  to: WeaponFxPoint,
  ageSeconds: number,
  flightSeconds: number
): void {
  for (const tracer of autocannonTracers(ageSeconds, flightSeconds)) {
    const head = along(from, to, tracer.progress);
    const tail = along(from, to, Math.max(0, tracer.progress - 0.05));
    stroke(ctx, tail, head, '#b86f40', 4, tracer.opacity * 0.48, 7);
    stroke(ctx, tail, head, '#ffe1ab', 1.3, tracer.opacity * 0.85, 3);
    circle(ctx, head, 1.5, '#fff1ca', tracer.opacity, 4);
    if (tracer.progress < 0.15) {
      circle(
        ctx,
        from,
        3 + noise(tracer.index * 5) * 3,
        '#fcb672',
        (1 - tracer.progress / 0.15) * 0.66,
        9
      );
    }
    const casing = {
      x: from.x - 13 - tracer.progress * 13,
      y: from.y + (tracer.index % 2 ? 1 : -1) * tracer.progress * 10,
    };
    circle(ctx, casing, 1.15, '#9b7861', (1 - tracer.progress) * 0.5, 2);
  }
}

interface VisionImpactFrame {
  readonly ctx: CanvasRenderingContext2D;
  readonly p: WeaponFxPoint;
  readonly ageSeconds: number;
  readonly seed: number;
  readonly shield: boolean;
  readonly t: number;
  readonly fade: number;
}

function drawPulseImpact({ ctx, p, ageSeconds }: VisionImpactFrame): void {
  for (let index = 0; index < 3; index += 1) {
    const v = (ageSeconds - index * 0.065) / 0.3;
    if (v < 0 || v > 1) continue;
    const x = p.x + (index - 1) * 4;
    const y = p.y + (index % 2 ? 3 : -3);
    const alpha = 1 - v;
    stroke(
      ctx,
      { x: x - 4 - v * 5, y: y - 3 - v * 5 },
      { x: x + 4 + v * 5, y: y + 3 + v * 5 },
      '#ffb2a1',
      1.4,
      alpha,
      6
    );
    stroke(
      ctx,
      { x: x - 3 - v * 3, y: y + 4 + v * 5 },
      { x: x + 3 + v * 3, y: y - 4 - v * 5 },
      '#fff1d8',
      0.7,
      alpha,
      5
    );
  }
}

function drawPlasmaImpact({ ctx, p, seed, shield, t, fade }: VisionImpactFrame): void {
  circle(ctx, p, 7 + t * 29, shield ? '#f3baff' : '#ffbb7e', fade * 0.47, 22);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index * TAU) / 12 + seed * 0.3;
    const radius = 9 + t * (14 + noise(index + seed) * 20);
    circle(
      ctx,
      { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius },
      2.2 + (1 - t) * 2,
      index % 2 ? '#ee82b5' : '#ffce88',
      fade * 0.68,
      10
    );
  }
  circle(ctx, p, 11 + t * 34, '#f6a8d4', fade * 0.72, 12, true, 1.8);
}

function drawGuidedMissileImpact({ ctx, p, seed, t, fade }: VisionImpactFrame): void {
  circle(ctx, p, 4 + t * 11, '#ffffe4', fade * 0.6, 13);
  for (let index = 0; index < 6; index += 1) {
    const angle = (index * TAU) / 6 + seed;
    const radius = t * 33;
    stroke(
      ctx,
      { x: p.x + Math.cos(angle) * 7, y: p.y + Math.sin(angle) * 7 },
      { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius },
      '#a9f9c7',
      0.9,
      fade * 0.82,
      8
    );
  }
  circle(ctx, p, 7 + t * 26, '#8bdab8', fade * 0.62, 8, true, 1.1);
}

function drawIonImpact({ ctx, p, ageSeconds, seed, t, fade }: VisionImpactFrame): void {
  // Both ion weapons intentionally use the *interpretation* of Ion Cannon's impact.
  for (let ring = 0; ring < 3; ring += 1) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1.1, 0.6);
    circle(
      ctx,
      { x: 0, y: 0 },
      9 + t * (27 + ring * 17),
      '#8fffe6',
      fade * (0.8 - ring * 0.16),
      13,
      true,
      2 - ring * 0.4
    );
    ctx.restore();
  }
  for (let index = 0; index < 12; index += 1) {
    const angle = (index * TAU) / 12;
    const radius = 17 + t * (29 + noise(index + seed) * 24);
    const offset = Math.sin(index * 4 + ageSeconds * 15) * 9;
    const middle = {
      x: p.x + Math.cos(angle) * radius * 0.48 + offset,
      y: p.y + Math.sin(angle) * radius * 0.48,
    };
    const end = { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius };
    stroke(ctx, p, middle, '#dffffb', 1, fade * 0.55, 9);
    stroke(ctx, middle, end, '#dffffb', 1, fade * 0.55, 9);
  }
}

function drawAutocannonImpact({ ctx, p, ageSeconds }: VisionImpactFrame): void {
  for (let index = 0; index < 7; index += 1) {
    const v = (ageSeconds - index * 0.065) / 0.26;
    if (v < 0 || v > 1) continue;
    const center = { x: p.x + ((index % 3) - 1) * 3, y: p.y + (index % 2 ? 4 : -4) };
    circle(ctx, center, 1.4, '#fff0bf', 1 - v, 6);
    for (let part = 0; part < 3; part += 1) {
      const angle = (index * 2 + part) * 2.38;
      const radius = v * (8 + 12 * noise(index * 5 + part));
      stroke(
        ctx,
        center,
        { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius },
        '#e4aa7c',
        0.85,
        1 - v,
        4
      );
    }
  }
}

function drawRailgunImpact({ ctx, p, seed, t, fade }: VisionImpactFrame): void {
  circle(ctx, p, 3 + t * 23, '#b7d9dd', fade * 0.32, 8, true, 1);
  circle(ctx, p, 8 + t * 38, '#f1faff', fade * 0.24, 7, true, 0.65);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index * TAU) / 8;
    const radius = 5 + t * (30 + noise(index + seed) * 27);
    stroke(
      ctx,
      p,
      { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius },
      '#d8dedd',
      0.75,
      fade * (0.5 + (index % 3) * 0.08),
      4
    );
  }
  circle(ctx, p, 2.5, '#ffffff', fade, 8);
}

function drawHeMissileImpact({ ctx, p, seed, t, fade }: VisionImpactFrame): void {
  circle(ctx, p, 12 + t * 55, '#ff8243', fade * 0.52, 25);
  circle(ctx, p, 7 + t * 25, '#ffd9a0', fade * 0.66, 18);
  circle(ctx, p, 14 + t * 65, '#ffe3b0', fade * 0.8, 13, true, 2.1);
  for (let index = 0; index < 20; index += 1) {
    const angle = index * 2.39 + seed;
    const radius = t * (30 + noise(index + seed) * 60);
    stroke(
      ctx,
      { x: p.x + Math.cos(angle) * radius * 0.5, y: p.y + Math.sin(angle) * radius * 0.5 },
      { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius },
      index % 2 ? '#fca270' : '#ffebb2',
      1.1,
      fade * 0.67,
      9
    );
  }
}

/** The eight impacts from the HTML's "Meine Version" tab. */
export function drawVisionWeaponImpact(
  ctx: CanvasRenderingContext2D,
  family: ShipWeaponFamily,
  point: WeaponFxPoint,
  ageSeconds: number,
  seed: number,
  shield: boolean
): void {
  if (ageSeconds < 0 || ageSeconds >= VISION_IMPACT_SECONDS) return;
  const t = ageSeconds / VISION_IMPACT_SECONDS;
  const fade = Math.pow(1 - t, 1.35);
  const frame: VisionImpactFrame = {
    ctx,
    p: point,
    ageSeconds,
    seed,
    shield,
    t,
    fade,
  };
  switch (family) {
    case 'pulse_laser':
      drawPulseImpact(frame);
      break;
    case 'plasma_battery':
      drawPlasmaImpact(frame);
      break;
    case 'guided_missile':
      drawGuidedMissileImpact(frame);
      break;
    case 'ion_laser':
    case 'ion_cannon':
      drawIonImpact(frame);
      break;
    case 'autocannon':
      drawAutocannonImpact(frame);
      break;
    case 'railgun':
      drawRailgunImpact(frame);
      break;
    case 'he_missile':
      drawHeMissileImpact(frame);
      break;
  }
  const p = point;
  if (shield) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, 0.65);
    circle(ctx, { x: 0, y: 0 }, 9 + t * 47, '#8ccfff', fade * 0.32, 8, true, 1.25);
    ctx.restore();
  }
}
