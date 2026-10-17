/** Purely visual combat effects. None of these routines applies or schedules damage. */
import {
  AUTOCANNON_ROUNDS,
  AUTOCANNON_ROUND_INTERVAL,
  ION_CANNON_ARC_SECONDS,
  RAIL_LANCE_SECONDS,
  VISION_REPEATER_SECONDS,
  VISION_REPEATER_IMPACT_SECONDS,
} from '../../core/combat-visual-timings';

export interface WeaponFxPoint {
  readonly x: number;
  readonly y: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function noise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function blend(a: number, b: number, progress: number): number {
  return a + (b - a) * progress;
}

function smoothFade(progress: number): number {
  const t = clamp01(progress);
  return 1 - t * t * (3 - 2 * t);
}

function line(
  context: CanvasRenderingContext2D,
  from: WeaponFxPoint,
  to: WeaponFxPoint,
  color: string,
  width: number,
  opacity: number,
  blur = 0
): void {
  context.strokeStyle = color;
  context.globalAlpha = clamp01(opacity);
  context.lineWidth = width;
  context.shadowColor = color;
  context.shadowBlur = blur;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
}

function path(
  context: CanvasRenderingContext2D,
  points: readonly WeaponFxPoint[],
  color: string,
  width: number,
  opacity: number,
  blur = 0
): void {
  context.strokeStyle = color;
  context.globalAlpha = clamp01(opacity);
  context.lineWidth = width;
  context.shadowColor = color;
  context.shadowBlur = blur;
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();
}

/** The first and final vertices remain exactly on the hardpoint/impact. */
export function ionArcVertices(
  from: WeaponFxPoint,
  to: WeaponFxPoint,
  seed: number,
  phase: number
): readonly WeaponFxPoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const amplitude = Math.min(12, 3 + length * 0.018);
  const offsetX = -dy / length;
  const offsetY = dx / length;
  const vertices: WeaponFxPoint[] = [{ ...from }];
  for (let index = 1; index < 14; index += 1) {
    const t = index / 14;
    const displacement =
      (noise(seed * 13 + index * 7 + phase * 31) - 0.5) * amplitude * 2 * Math.sin(Math.PI * t);
    vertices.push({
      x: blend(from.x, to.x, t) + offsetX * displacement,
      y: blend(from.y, to.y, t) + offsetY * displacement,
    });
  }
  vertices.push({ ...to });
  return vertices;
}

export function drawIonCannonArc(
  context: CanvasRenderingContext2D,
  from: WeaponFxPoint,
  to: WeaponFxPoint,
  ageSeconds: number,
  seed: number
): void {
  if (ageSeconds < 0 || ageSeconds >= ION_CANNON_ARC_SECONDS) return;
  const progress = ageSeconds / ION_CANNON_ARC_SECONDS;
  const reach = clamp01(ageSeconds / 0.075);
  const end = {
    x: blend(from.x, to.x, reach),
    y: blend(from.y, to.y, reach),
  };
  const flickerPhase = Math.floor(ageSeconds * 38);
  const opacity = smoothFade(progress);
  const vertices = ionArcVertices(from, end, seed, flickerPhase);
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  path(context, vertices, '#4acbff', 4.5, opacity * 0.34, 15);
  path(context, vertices, '#86e9ff', 2.2, opacity * 0.85, 8);
  path(context, vertices, '#f0ffff', 0.85, opacity, 3);
  for (let index = 0; index < 3; index += 1) {
    const vertexIndex = 3 + index * 4;
    const root = vertices[vertexIndex];
    if (!root) continue;
    const direction = (index % 2 === 0 ? 1 : -1) * (15 + noise(seed + index) * 13);
    const tip = { x: root.x - direction * 0.3, y: root.y + direction };
    path(
      context,
      ionArcVertices(root, tip, seed + 43 * (index + 1), flickerPhase),
      '#9befff',
      0.7,
      opacity * 0.55,
      5
    );
  }
  context.restore();
}

/** Every spark stays within a few screen pixels of the fading lance. */
export function railLanceParticle(
  from: WeaponFxPoint,
  to: WeaponFxPoint,
  seed: number,
  ageSeconds: number
): WeaponFxPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const along = 0.04 + noise(seed * 11) * 0.92;
  const phase = ageSeconds * (4.3 + noise(seed * 3) * 2.2) + seed * 2.4;
  const radius = 0.8 + noise(seed * 17) * 2.6;
  const displacement = Math.sin(phase) * radius;
  return {
    x: blend(from.x, to.x, along) - (dy / length) * displacement,
    y: blend(from.y, to.y, along) + (dx / length) * displacement,
  };
}

export function drawRailgunLance(
  context: CanvasRenderingContext2D,
  from: WeaponFxPoint,
  to: WeaponFxPoint,
  ageSeconds: number
): void {
  if (ageSeconds < 0 || ageSeconds >= RAIL_LANCE_SECONDS) return;
  const progress = ageSeconds / RAIL_LANCE_SECONDS;
  const fade = smoothFade(progress);
  const reveal = clamp01(ageSeconds / 0.045);
  const tip = { x: blend(from.x, to.x, reveal), y: blend(from.y, to.y, reveal) };
  context.save();
  context.lineCap = 'round';
  line(context, from, tip, '#ffe5cc', 6, fade * 0.15, 16);
  line(context, from, tip, '#fff3e9', 2.6, fade * 0.54, 8);
  line(context, from, tip, '#ffffff', 1, fade * 0.98);
  // Faint, local vapor. Unlike a spark shower, the wisps never drift out.
  for (let index = 0; index < 12; index += 1) {
    const point = railLanceParticle(from, tip, index + 101, ageSeconds);
    const size = 2.3 + noise(index * 7) * 2.5;
    context.globalAlpha = fade * (0.035 + noise(index * 9) * 0.065);
    context.shadowColor = '#ffffff';
    context.shadowBlur = 6;
    context.fillStyle = '#e8e7e3';
    context.beginPath();
    context.ellipse(point.x, point.y, size * 1.5, size, index * 1.2, 0, Math.PI * 2);
    context.fill();
  }
  // Microscopic glitter orbiting the beam rather than flying away from it.
  for (let index = 0; index < 32; index += 1) {
    const point = railLanceParticle(from, tip, index + 1, ageSeconds);
    context.globalAlpha = fade * (0.23 + noise(index * 23) * 0.42);
    context.shadowColor = '#fff7ed';
    context.shadowBlur = 2;
    context.fillStyle = index % 4 === 0 ? '#ffe8cd' : '#ffffff';
    context.beginPath();
    context.arc(point.x, point.y, 0.35 + noise(index * 29) * 0.48, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

/** Lightweight, independent high-rate front repeater visuals. */
function repeaterCircle(
  context: CanvasRenderingContext2D,
  point: WeaponFxPoint,
  radius: number,
  color: string,
  alpha: number,
  outline = false
): void {
  context.globalAlpha = clamp01(alpha);
  context.shadowColor = color;
  context.shadowBlur = 7;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  if (outline) {
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.stroke();
  } else {
    context.fillStyle = color;
    context.fill();
  }
}

/** Four phased ultraviolet flechettes for one gameplay shot, not four damage events. */
export function drawVisionFrontRepeater(
  context: CanvasRenderingContext2D,
  from: WeaponFxPoint,
  to: WeaponFxPoint,
  ageSeconds: number
): void {
  if (ageSeconds < 0 || ageSeconds >= VISION_REPEATER_SECONDS) return;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / length, y: dx / length };
  context.save();
  context.lineCap = 'round';
  for (let index = 0; index < 4; index += 1) {
    const launch = index * 0.035;
    const flight = (ageSeconds - launch) / 0.115;
    if (flight < 0 || flight >= 1) continue;
    // Deliberately offset packets: a compact prismatic burst, not copper slugs.
    const lane = (index - 1.5) * 3.8;
    const progress = clamp01(flight);
    const rear = clamp01(flight - 0.105);
    const offset = (point: WeaponFxPoint): WeaponFxPoint => ({
      x: point.x + normal.x * lane,
      y: point.y + normal.y * lane,
    });
    const head = offset({
      x: blend(from.x, to.x, progress),
      y: blend(from.y, to.y, progress),
    });
    const tail = offset({
      x: blend(from.x, to.x, rear),
      y: blend(from.y, to.y, rear),
    });
    const fade = Math.sin(Math.PI * flight) * 0.7 + 0.3;
    line(context, tail, head, '#6524bd', 6, fade * 0.24, 15);
    line(context, tail, head, '#d24fff', 2.5, fade * 0.85, 7);
    line(context, tail, head, '#ffe8ff', 0.9, fade, 3);
    // Each flechette has a broken diamond tip, unlike autocannon tracer dots.
    const back = {
      x: head.x - (dx / length) * 5,
      y: head.y - (dy / length) * 5,
    };
    path(
      context,
      [
        { x: back.x + normal.x * 2, y: back.y + normal.y * 2 },
        { x: head.x + (dx / length) * 2, y: head.y + (dy / length) * 2 },
        { x: back.x - normal.x * 2, y: back.y - normal.y * 2 },
      ],
      '#fff0ff',
      1.1,
      fade,
      4
    );
    if (flight < 0.26) {
      const pulse = 1 - flight / 0.26;
      repeaterCircle(context, offset(from), 2.5 + flight * 5, '#b751ff', pulse * 0.7);
    }
  }
  context.restore();
}

/** Prismatic fracture, not the autocannon's copper sparks and shell flashes. */
export function drawVisionRepeaterImpact(
  context: CanvasRenderingContext2D,
  point: WeaponFxPoint,
  ageSeconds: number,
  seed: number,
  shield: boolean
): void {
  if (ageSeconds < 0 || ageSeconds >= VISION_REPEATER_IMPACT_SECONDS) return;
  const progress = ageSeconds / VISION_REPEATER_IMPACT_SECONDS;
  const fade = Math.pow(1 - progress, 1.5);
  context.save();
  repeaterCircle(context, point, 1.7 + progress * 2.6, '#fff3ff', fade);
  if (shield) {
    repeaterCircle(context, point, 4 + progress * 19, '#c78cff', fade * 0.78, true);
    repeaterCircle(context, point, 2 + progress * 11, '#f59cff', fade * 0.44, true);
  } else {
    // Four angular fissures, with short off-axis branches.
    for (let index = 0; index < 4; index += 1) {
      const angle = (index * Math.PI) / 2 + noise(seed + index) * 0.24;
      const radius = 4 + progress * (12 + noise(seed * 3 + index) * 6);
      const middle = {
        x: point.x + Math.cos(angle) * radius * 0.58,
        y: point.y + Math.sin(angle) * radius * 0.58,
      };
      const end = {
        x: point.x + Math.cos(angle + 0.21) * radius,
        y: point.y + Math.sin(angle + 0.21) * radius,
      };
      path(context, [point, middle, end], '#d88cff', 1.3, fade * 0.88, 6);
      line(context, middle, end, '#fff1ff', 0.55, fade * 0.75, 2);
    }
    repeaterCircle(context, point, 3 + progress * 7, '#932ae5', fade * 0.36, true);
  }
  context.restore();
}

export interface AutocannonTracer {
  readonly index: number;
  readonly progress: number;
  readonly opacity: number;
}

/** Seven distinct, staggered rounds; no extra gameplay projectiles or hits. */
export function autocannonTracers(
  ageSeconds: number,
  flightSeconds: number
): readonly AutocannonTracer[] {
  const flight = Math.max(0.12, flightSeconds);
  const result: AutocannonTracer[] = [];
  for (let index = 0; index < AUTOCANNON_ROUNDS; index += 1) {
    const progress = (ageSeconds - index * AUTOCANNON_ROUND_INTERVAL) / flight;
    if (progress < 0 || progress >= 1) continue;
    result.push({
      index,
      progress,
      opacity: Math.min(1, progress * 15, (1 - progress) * 17),
    });
  }
  return result;
}

export function drawAutocannonBurst(
  context: CanvasRenderingContext2D,
  from: WeaponFxPoint,
  to: WeaponFxPoint,
  ageSeconds: number,
  flightSeconds: number
): void {
  const tracers = autocannonTracers(ageSeconds, flightSeconds);
  if (!tracers.length) return;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const tailFraction = Math.min(0.14, 20 / length);
  context.save();
  context.lineCap = 'round';
  for (const tracer of tracers) {
    const end = {
      x: blend(from.x, to.x, tracer.progress),
      y: blend(from.y, to.y, tracer.progress),
    };
    const tail = {
      x: blend(from.x, to.x, Math.max(0, tracer.progress - tailFraction)),
      y: blend(from.y, to.y, Math.max(0, tracer.progress - tailFraction)),
    };
    line(context, tail, end, '#f4c889', 3.2, tracer.opacity * 0.52, 7);
    line(context, tail, end, '#fff4dd', 1.25, tracer.opacity, 3);
    context.globalAlpha = tracer.opacity;
    context.fillStyle = '#fff7ec';
    context.beginPath();
    context.arc(end.x, end.y, 1.15, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}
