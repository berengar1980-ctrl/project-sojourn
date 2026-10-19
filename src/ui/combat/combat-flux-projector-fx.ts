/** Distinct forward shield-breaker pulse and radial surface discharge. */
export interface FluxPoint {
  readonly x: number;
  readonly y: number;
}

function lerp(from: FluxPoint, to: FluxPoint, t: number): FluxPoint {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function ring(
  context: CanvasRenderingContext2D,
  center: FluxPoint,
  radius: number,
  alpha: number
): void {
  context.globalAlpha = alpha;
  context.strokeStyle = '#68f2e6';
  context.lineWidth = 1.8;
  context.shadowColor = '#39fce4';
  context.shadowBlur = 12;
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.stroke();
}

/** An advancing energy packet, not a continuous beam. */
export function drawFluxProjectorPulse(
  context: CanvasRenderingContext2D,
  from: FluxPoint,
  to: FluxPoint,
  ageSeconds: number
): void {
  if (ageSeconds < 0 || ageSeconds >= 0.45) return;
  const progress = Math.min(1, ageSeconds / 0.18);
  const head = lerp(from, to, progress);
  const tail = lerp(from, to, Math.max(0, progress - 0.09));
  context.save();
  context.lineCap = 'round';
  context.strokeStyle = '#35dcd5';
  context.shadowColor = '#23e8e8';
  context.shadowBlur = 18;
  context.lineWidth = 7;
  context.globalAlpha = 0.25 * (1 - ageSeconds / 0.45);
  context.beginPath();
  context.moveTo(tail.x, tail.y);
  context.lineTo(head.x, head.y);
  context.stroke();
  context.strokeStyle = '#e7ffff';
  context.lineWidth = 2;
  context.globalAlpha = 1 - ageSeconds / 0.45;
  context.beginPath();
  context.moveTo(tail.x, tail.y);
  context.lineTo(head.x, head.y);
  context.stroke();
  context.restore();
}

/** Two expanding charge rings with brief spokes at the physical impact point. */
export function drawFluxProjectorImpact(
  context: CanvasRenderingContext2D,
  point: FluxPoint,
  ageSeconds: number,
  seed: number,
  shield: boolean
): void {
  if (ageSeconds < 0 || ageSeconds >= 1.1) return;
  const t = ageSeconds / 1.1;
  const fade = (1 - t) ** 1.5;
  context.save();
  ring(context, point, 6 + t * (shield ? 33 : 20), fade * 0.8);
  const secondaryRadius = 3 + Math.max(0, t - 0.12) * (shield ? 26 : 17);
  ring(context, point, secondaryRadius, fade * 0.45);
  context.strokeStyle = '#e6ffff';
  context.lineWidth = 0.9;
  context.shadowBlur = 5;
  for (let index = 0; index < 7; index += 1) {
    const angle = ((index + seed % 5) * Math.PI * 2) / 7;
    const inner = 6 + t * 9;
    const outer = inner + 8 + t * 15;
    context.globalAlpha = fade * 0.8;
    context.beginPath();
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    context.moveTo(point.x + x * inner, point.y + y * inner);
    context.lineTo(point.x + x * outer, point.y + y * outer);
    context.stroke();
  }
  context.restore();
}
