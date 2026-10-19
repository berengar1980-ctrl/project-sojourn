import type { StrategicCombatantSnapshot } from '../../systems/combat/strategic-combat-types';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';

/**
 * Deterministic bow compression arcs. No sprites, emitters or persistent
 * particles: cost stays bounded even when several vessels ram at once.
 */
export function drawCombatRamEffect(
  context: CanvasRenderingContext2D,
  ship: StrategicCombatantSnapshot,
  geometry: ShipScreenGeometry,
  elapsed: number
): void {
  const phase = ship.ramPhase;
  const hitAge = elapsed - (ship.ramImpactAt ?? -100);
  if (!phase && (hitAge < 0 || hitAge > 0.32)) return;
  const bow = geometry.width * 0.48;
  const width = Math.max(9, geometry.height * 0.52);
  context.save();
  context.translate(geometry.center.x, geometry.center.y);
  context.rotate(geometry.angle);
  if (phase) {
    const charging = phase === 'impact' && ship.boostActive;
    const count = charging ? 3 : 1;
    const pulse = 0.8 + Math.sin(elapsed * 23) * 0.2;
    context.strokeStyle = charging ? '#a9e8ff' : '#a8bac3';
    context.shadowColor = charging ? '#75c9ed' : '#748d9a';
    context.shadowBlur = charging ? 11 : 4;
    context.lineWidth = charging ? 1.35 : 0.8;
    for (let arc = 0; arc < count; arc += 1) {
      const ripple = charging ? (elapsed * 35) % 10 : 0;
      const offset = 6 + arc * 10 + ripple;
      const extent = width * (1 + arc * 0.3);
      context.globalAlpha = (charging ? 0.65 : 0.22) * pulse / (1 + arc * 0.3);
      context.beginPath();
      for (let step = -7; step <= 7; step += 1) {
        const y = (step / 7) * extent;
        const x = bow + offset + 5 * (1 - (y / extent) ** 2);
        if (step === -7) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
  }
  if (hitAge >= 0 && hitAge < 0.32) {
    const progress = hitAge / 0.32;
    context.shadowColor = '#e1f4ff';
    context.shadowBlur = 15;
    context.strokeStyle = '#d6eff9';
    context.globalAlpha = 1 - progress;
    context.lineWidth = 2 * (1 - progress);
    context.beginPath();
    context.arc(bow, 0, 5 + progress * 22, -Math.PI * 0.7, Math.PI * 0.7);
    context.stroke();
  }
  context.restore();
}
