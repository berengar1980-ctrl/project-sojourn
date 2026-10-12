import type { CombatImpactSnapshot } from '../../systems/combat/strategic-combat-service';

type Impact = CombatImpactSnapshot;

function impactRadius(impact: Impact, progress: number): number {
  const explosive = impact.weaponKind === 'missile';
  const rail = impact.weaponKind === 'rail' || impact.weaponKind === 'autocannon';
  if (impact.layer === 'obstacle') {
    return (explosive ? 12 : rail ? 5 : 4) + progress * (explosive ? 39 : rail ? 19 : 12);
  }
  return (
    (explosive ? 12 : impact.weaponKind === 'plasma' ? 9 : 7) + progress * (explosive ? 42 : 29)
  );
}

function impactFill(impact: Impact, alpha: number): string {
  if (impact.layer === 'shield') return `rgba(105, 210, 255, ${alpha * 0.75})`;
  if (impact.layer !== 'obstacle') return `rgba(255, 147, 72, ${alpha * 0.85})`;
  if (impact.weaponKind === 'missile') return `rgba(255, 156, 77, ${alpha * 0.85})`;
  if (impact.weaponKind === 'plasma') return `rgba(84, 212, 255, ${alpha * 0.8})`;
  return `rgba(224, 202, 161, ${alpha * 0.7})`;
}

function impactStroke(impact: Impact, alpha: number): string {
  if (impact.layer === 'shield') return `rgba(176, 239, 255, ${alpha * 0.85})`;
  if (impact.layer === 'obstacle') {
    return impact.weaponKind === 'missile'
      ? `rgba(255, 177, 101, ${alpha * 0.8})`
      : `rgba(213, 195, 170, ${alpha * 0.75})`;
  }
  return `rgba(255, 218, 154, ${alpha * 0.8})`;
}

function impactRayCount(impact: Impact): number {
  if (impact.layer !== 'obstacle') return 5;
  if (impact.weaponKind === 'missile') return 9;
  if (impact.weaponKind === 'rail' || impact.weaponKind === 'autocannon') return 7;
  return 3;
}

export function drawCombatHullImpact(
  context: CanvasRenderingContext2D,
  impact: CombatImpactSnapshot | null,
  impactAge: number,
  point: { readonly x: number; readonly y: number }
): void {
  if (!impact || impactAge >= 1 || (impact.layer === 'miss' && impact.weaponKind !== 'missile')) {
    return;
  }
  const asteroid = impact.layer === 'obstacle';
  const explosive = impact.weaponKind === 'missile';
  const radius = impactRadius(impact, impactAge);
  const alpha = 1 - impactAge;
  context.save();
  context.fillStyle = impactFill(impact, alpha);
  context.shadowColor = impact.layer === 'shield' ? '#77dcff' : '#ff973f';
  context.shadowBlur = explosive ? 20 : 11;
  context.beginPath();
  context.arc(point.x, point.y, radius * (explosive ? 0.75 : 0.55), 0, Math.PI * 2);
  context.fill();
  if (impact.layer === 'hull' || impact.layer === 'shield' || asteroid) {
    context.strokeStyle = impactStroke(impact, alpha);
    context.lineWidth = 1.4;
    for (let index = 0; index < impactRayCount(impact); index += 1) {
      const angle = index * 1.37 + impact.serial;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(point.x + Math.cos(angle) * radius, point.y + Math.sin(angle) * radius);
      context.stroke();
    }
  }
  context.restore();
}
