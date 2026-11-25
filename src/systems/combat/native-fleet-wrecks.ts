import { combatWreckVariantFor } from '../../core/combat-wreck-variant';
import { getShipDefinition } from '../ships';
import type { CombatVisualAsteroid, MutableCombatant } from './strategic-combat-types';

/**
 * One physical wreck per destroyed fleet ship. The same native asteroid world
 * owns collision, drift, 3D salvage mesh and weapon cover on every duel map.
 */
export function materializeNativeFleetWrecks(
  actors: readonly MutableCombatant[],
  asteroids: CombatVisualAsteroid[],
  recorded: Set<string>,
  seed: number,
  elapsedSeconds: number
): void {
  for (const actor of actors) {
    if (actor.hullHp > 0 || recorded.has(actor.setup.id)) continue;
    recorded.add(actor.setup.id);
    const length = getShipDefinition(actor.setup.shipId)?.nominalLengthMeters ?? 60;
    const radius = Math.max(18, length * 0.6);
    asteroids.push({
      id: 'fleet-wreck:' + actor.setup.id,
      destroyedShipId: actor.setup.id,
      // Large destroyed hulls block tactical routes just like salvage-map sections.
      kind: 'resource',
      combatWreckVariant: combatWreckVariantFor(seed, actor.setup.id, elapsedSeconds),
      position: { ...actor.position },
      velocity: { x: actor.velocity.x * 0.35, y: actor.velocity.y * 0.35 },
      radius,
      collisionRadius: radius * 0.58,
      rotation: actor.headingRadians,
      angularVelocity: 0.018,
      rotation3d: { x: 0.19, y: 0.16, z: actor.headingRadians },
      spin3d: { x: 0.021, y: 0.014, z: 0 },
    });
  }
}
