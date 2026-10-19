import type { StrategicCombatRuntime, StrategicCombatSide } from './strategic-combat-types';

interface RamContactVisual {
  readonly struckSide: StrategicCombatSide;
  readonly struckShielded: boolean;
}

/** Capture the initiator before the physics module clears ramApproach. */
export function captureRamVisuals(runtime: StrategicCombatRuntime): RamContactVisual {
  const { attacker, defender } = runtime;
  const attackerRams = attacker.ramApproach?.phase === 'impact';
  const defenderRams = defender.ramApproach?.phase === 'impact';
  if (attackerRams) attacker.ramImpactAt = runtime.elapsedSeconds;
  if (defenderRams) defender.ramImpactAt = runtime.elapsedSeconds;
  const struckSide = defenderRams && !attackerRams ? 'attacker' : 'defender';
  const struck = struckSide === 'attacker' ? attacker : defender;
  return { struckSide, struckShielded: struck.shieldHp > 0 };
}

/**
 * Purely visual spark at the point of contact. Never record a second combat
 * damage/log event or overwrite the last actual weapon impact.
 */
export function emitRamContactSpark(
  runtime: StrategicCombatRuntime,
  visual: RamContactVisual,
  firstDamage: number,
  secondDamage: number
): void {
  if (!runtime.recentImpacts || typeof runtime.impactSerial !== 'number') return;
  const { attacker, defender } = runtime;
  runtime.impactSerial += 1;
  runtime.recentImpacts.push({
    serial: runtime.impactSerial,
    target: visual.struckSide,
    layer: visual.struckShielded ? 'shield' : 'hull',
    damage: visual.struckSide === 'attacker' ? firstDamage : secondDamage,
    position: {
      x: (attacker.position.x + defender.position.x) * 0.5,
      y: (attacker.position.y + defender.position.y) * 0.5,
    },
  });
  if (runtime.recentImpacts.length > 64) runtime.recentImpacts.shift();
}
