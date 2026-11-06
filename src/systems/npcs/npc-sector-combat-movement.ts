import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import { npcOperationalSpeed } from './npc-upgrade-service';
import { FUEL_DISTANCE_SCALE, turnToward } from './npc-sector-routing';

const COMBAT_TURN_RATE = 1.15;

/** Shared NPC combat pursuit and escape dynamics, independent of the sector lifecycle. */
export function advanceNpcCombatMovement(
  world: WorldMap,
  npc: SectorNpcState,
  target: WorldPoint,
  deltaSeconds: number
): void {
  const movement = npc.combatMovement;
  if (!movement || movement.mode === 'engaged') return;
  const away = movement.mode === 'flee';
  const dx = away ? movement.position.x - target.x : target.x - movement.position.x;
  const dy = away ? movement.position.y - target.y : target.y - movement.position.y;
  if (Math.hypot(dx, dy) <= 0.001) return;

  const desiredHeading = Math.atan2(dy, dx);
  movement.headingRadians = turnToward(
    movement.headingRadians,
    desiredHeading,
    COMBAT_TURN_RATE * deltaSeconds
  );
  const baseSpeed = npcOperationalSpeed(npc);
  const targetSpeed = baseSpeed * (away ? 1.05 : 1.08);
  const acceleration = Math.max(15, baseSpeed * 0.85);
  movement.speed = Math.min(targetSpeed, movement.speed + acceleration * deltaSeconds);
  const moved = movement.speed * deltaSeconds;
  movement.position = {
    x: Math.max(
      0,
      Math.min(world.width, movement.position.x + Math.cos(movement.headingRadians) * moved)
    ),
    y: Math.max(
      0,
      Math.min(world.height, movement.position.y + Math.sin(movement.headingRadians) * moved)
    ),
  };
  npc.fuel = Math.max(0, npc.fuel - moved * npc.fuelUse * FUEL_DISTANCE_SCALE);
}
