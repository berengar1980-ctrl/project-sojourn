import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { drawDestroyedCombatant } from './combat-wreck-destruction-renderer';

/** Fleet-only transition, keeping the unmodified 1vs1 wreck renderer intact. */
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
