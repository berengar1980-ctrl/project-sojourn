import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';

interface Point { readonly x: number; readonly y: number }

export function drawCombatGrapple(
  context: CanvasRenderingContext2D,
  model: StrategicCombatSnapshot,
  screen: (point: Point) => Point,
  sourceAnchor: (side: 'attacker' | 'defender') => Point
): void {
  const grapple = model.grapple;
  if (!grapple) return;
  const target = grapple.owner === 'attacker' ? model.defender : model.attacker;
  const origin = sourceAnchor(grapple.owner);
  const destination = screen(target.position);
  const progress = Math.min(1, grapple.elapsed / 0.65);
  const tip = {
    x: origin.x + (destination.x - origin.x) * progress,
    y: origin.y + (destination.y - origin.y) * progress,
  };
  context.save();
  context.lineWidth = 2.5;
  context.strokeStyle = grapple.success ? '#b9dee7' : '#9ba4ab';
  context.beginPath();
  context.moveTo(origin.x, origin.y);
  context.lineTo(tip.x, tip.y);
  context.stroke();
  context.translate(tip.x, tip.y);
  context.rotate(Math.atan2(destination.y - origin.y, destination.x - origin.x));
  context.fillStyle = grapple.success ? '#d0f3ff' : '#e6c5a8';
  context.beginPath();
  context.moveTo(11, 0);
  context.lineTo(-3, -4);
  context.lineTo(-9, -10);
  context.lineTo(-13, -7);
  context.lineTo(-7, 1);
  context.lineTo(-13, 7);
  context.lineTo(-9, 10);
  context.lineTo(-3, 4);
  context.closePath();
  context.fill();
  if (!grapple.success && grapple.elapsed > 0.65) {
    const bounce = Math.min(1, (grapple.elapsed - 0.65) / 0.45);
    context.globalAlpha = 1 - bounce;
    context.strokeStyle = '#ffc88b';
    context.beginPath();
    context.arc(0, 0, bounce * 22, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}
