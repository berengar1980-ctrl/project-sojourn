import { hash } from './strategic-combat-renderer-math';

export function drawCombatBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  attackerId: string,
  defenderId: string
): void {
  const gradient = context.createRadialGradient(width * 0.5, height * 0.46, 0, width * 0.5, height * 0.46, Math.max(width, height) * 0.78);
  gradient.addColorStop(0, '#111b24');
  gradient.addColorStop(0.52, '#071018');
  gradient.addColorStop(1, '#020507');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const seed = hash(attackerId + ':' + defenderId);
  context.fillStyle = 'rgba(205, 225, 236, .62)';
  for (let index = 0; index < 110; index += 1) {
    const x = ((seed + index * 2654435761) >>> 0) % 10000;
    const y = ((seed ^ (index * 2246822519)) >>> 0) % 10000;
    context.globalAlpha = 0.26 + ((index * 37) % 48) / 100;
    context.beginPath();
    context.arc((x / 10000) * width, (y / 10000) * height, index % 11 === 0 ? 1.2 : 0.55, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}
