/** Distinct compact pulse and radial discharge for the forward shield breaker. */
export interface FluxPoint {
  readonly x: number;
  readonly y: number;
}

/** The bolt travels along the captured muzzle-to-impact segment. */
export function drawFluxProjectorPulse(
  context: CanvasRenderingContext2D,
  from: FluxPoint,
  to: FluxPoint,
  ageSeconds: number
): void {
  if (ageSeconds < 0 || ageSeconds >= 0.45) return;
  const progress = Math.min(1, ageSeconds / 0.18);
  const rear = Math.max(0, progress - 0.09);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  context.save();
  context.lineCap = 'round';
  context.strokeStyle = '#35dcd5';
  context.shadowColor = '#23e8e8';
  context.shadowBlur = 18;
  context.lineWidth = 7;
  context.globalAlpha = 0.25;
  context.beginPath();
  context.moveTo(from.x + dx * rear, from.y + dy * rear);
  context.lineTo(from.x + dx * progress, from.y + dy * progress);
  context.stroke();
  context.strokeStyle = '#e7ffff';
  context.lineWidth = 2;
  context.globalAlpha = 1 - ageSeconds / 0.45;
  context.beginPath();
  context.moveTo(from.x + dx * rear, from.y + dy * rear);
  context.lineTo(from.x + dx * progress, from.y + dy * progress);
  context.stroke();
  context.restore();
}

/** Localized expanding concentric rings and seven short discharge spokes. */
export function drawFluxProjectorImpact(
  context: CanvasRenderingContext2D,
  point: FluxPoint,
  ageSeconds: number,
  seed: number,
  shield: boolean
): void {
  if (ageSeconds < 0 || ageSeconds >= 1.1) return;
  const progress = ageSeconds / 1.1;
  const fade = (1 - progress) ** 1.5;
  const radius = shield ? 33 : 20;
  context.save();
  context.strokeStyle = '#68f2e6';
  context.shadowColor = '#39fce4';
  context.shadowBlur = 12;
  for (let ring = 0; ring < 2; ring += 1) {
    context.globalAlpha = fade * (ring === 0 ? 0.8 : 0.45);
    context.lineWidth = ring === 0 ? 1.8 : 1.1;
    context.beginPath();
    context.arc(point.x, point.y, 6 + progress * radius - ring * 3, 0, Math.PI * 2);
    context.stroke();
  }
  context.strokeStyle = '#e6ffff';
  context.lineWidth = 0.9;
  for (let index = 0; index < 7; index += 1) {
    const angle = ((index + seed % 5) * Math.PI * 2) / 7;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const inner = 6 + progress * 9;
    const outer = inner + 8 + progress * 15;
    context.globalAlpha = fade * 0.8;
    context.beginPath();
    context.moveTo(point.x + dx * inner, point.y + dy * inner);
    context.lineTo(point.x + dx * outer, point.y + dy * outer);
    context.stroke();
  }
  context.restore();
}
