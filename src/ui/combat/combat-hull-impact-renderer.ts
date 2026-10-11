import type { CombatImpactSnapshot } from '../../systems/combat/strategic-combat-service';

export function drawCombatHullImpact(
  context: CanvasRenderingContext2D,
  impact: CombatImpactSnapshot | null,
  impactAge: number,
  point: { readonly x: number; readonly y: number }
): void {
    if (!impact || impactAge >= 1 || impact.layer === 'miss') {
      return;
    }
    const progress = impactAge;
    const explosive = impact.weaponKind === 'missile';
    const plasma = impact.weaponKind === 'plasma';
    const radius = (explosive ? 12 : plasma ? 9 : 7) + progress * (explosive ? 42 : 29);
    const alpha = 1 - progress;

    context.save();
    context.fillStyle =
      impact.layer === 'shield'
        ? `rgba(105, 210, 255, ${alpha * 0.75})`
        : impact.layer === 'obstacle'
          ? `rgba(196, 185, 160, ${alpha * 0.6})`
          : `rgba(255, 147, 72, ${alpha * 0.85})`;
    context.shadowColor = impact.layer === 'shield' ? '#77dcff' : '#ff973f';
    context.shadowBlur = explosive ? 20 : 11;
    context.beginPath();
    context.arc(point.x, point.y, radius * (explosive ? 0.75 : 0.55), 0, Math.PI * 2);
    context.fill();
    if (impact.layer === 'hull' || impact.layer === 'shield') {
      context.strokeStyle =
        impact.layer === 'shield'
          ? `rgba(176, 239, 255, ${alpha * 0.85})`
          : `rgba(255, 218, 154, ${alpha * 0.8})`;
      context.lineWidth = 1.4;
      for (let index = 0; index < 5; index += 1) {
        const angle = index * 1.37 + impact.serial;
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(point.x + Math.cos(angle) * radius, point.y + Math.sin(angle) * radius);
        context.stroke();
      }
    }
    context.restore();
}
