import { drawCombatHullImpact } from './combat-hull-impact-renderer';
import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-service';

export function drawStrategicHullImpact(
context: CanvasRenderingContext2D,
impact: StrategicCombatSnapshot['lastImpact'],
impactAge: number,
point: { readonly x: number; readonly y: number }
): void {
  if (!impact) return;
  drawCombatHullImpact(context, impact, impactAge, point);
  if (impact.source === 'tractor_asteroid' && impactAge < 1) {
    const progress = impactAge;
    context.save();
    context.globalAlpha = 1 - progress;
    context.strokeStyle = '#b8f7e7';
    context.shadowColor = '#7afae0';
    context.shadowBlur = 24;
    context.lineWidth = 5 * (1 - progress) + 0.5;
    context.beginPath();
    context.arc(point.x, point.y, 12 + progress * 85, 0, Math.PI * 2);
    context.stroke();
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2 + impact.serial * 0.7;
      const length = (15 + progress * 95) * (0.7 + (i % 4) * 0.14);
      context.beginPath();
      context.moveTo(point.x + Math.cos(angle) * 6, point.y + Math.sin(angle) * 6);
      context.lineTo(point.x + Math.cos(angle) * length, point.y + Math.sin(angle) * length);
      context.stroke();
    }
    context.restore();
  }
}