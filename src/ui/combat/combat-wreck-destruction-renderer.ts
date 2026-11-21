import { drawCombatWreck3d } from '../salvage/combat-wreck-mesh';
import { combatWreckVariantFor } from '../../core/combat-wreck-variant';
import { drawShipDestruction } from './ship-destruction-visual';
import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';

export function drawDestroyedCombatant(
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  size: number,
  headingRadians: number,
  shipId: string,
  arenaSeed: number,
  combatElapsedSeconds: number,
  age: number
): void {
  if (age >= 0.28 && !shipId.startsWith('security-drone:')) {
    const variant = combatWreckVariantFor(arenaSeed, shipId, combatElapsedSeconds);
    context.save();
    context.translate(center.x, center.y);
    context.globalAlpha = Math.min(1, (age - 0.28) * 3);
    drawCombatWreck3d(context, variant, size * 0.65, {
      x: 0.19,
      y: 0.16,
      z: headingRadians,
    });
    context.restore();
  }
  drawShipDestruction(context, center.x, center.y, size * 0.6, age);
}

/** Preserve the original 1vs1 loser transition when no physical fleet wreck exists. */
export function paintNativeDuelDestruction(
  context: CanvasRenderingContext2D,
  duel: StrategicCombatSnapshot,
  geometry: (ship: StrategicCombatSnapshot['attacker']) => ShipScreenGeometry,
  now: number,
  startedAt: number | null,
  physicalWreckIds: ReadonlySet<string>
): number | null {
  if (duel.winner === null) return null;
  const start = startedAt ?? now;
  const loser = duel.winner === 'attacker' ? duel.defender : duel.attacker;
  if (loser.hullHp <= 0 && !physicalWreckIds.has(loser.id)) {
    const shape = geometry(loser);
    drawDestroyedCombatant(
      context,
      shape.center,
      Math.max(shape.width, shape.height),
      loser.headingRadians,
      loser.id,
      duel.arena.backdropSeed ?? 0,
      duel.elapsedSeconds,
      now - start
    );
  }
  return start;
}
