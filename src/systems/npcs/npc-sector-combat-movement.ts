import type { SectorNpcState } from '../../core/npc-types';
import type { NpcCombatMovementMode, NpcCombatTargetKind } from '../../core/npc-types';
import { ensurePhysicalShipVelocity } from '../../core/physical-ship-state';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import { npcOperationalSpeed } from './npc-upgrade-service';
import { turnToward } from './npc-sector-routing';
import { fuelForDistance } from '../../core/fuel-pricing';

const COMBAT_TURN_RATE = 1.15;

export function createNpcCombatMovementState(
  mode: NpcCombatMovementMode,
  targetKind: NpcCombatTargetKind,
  targetId: string,
  position: WorldPoint,
  velocity: WorldPoint,
  headingRadians: number
): NonNullable<SectorNpcState['combatMovement']> {
  return {
    mode,
    targetKind,
    targetId,
    position: { ...position },
    velocity: { ...velocity },
    headingRadians,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
    longitudinalThrust: 0,
    get speed() {
      return Math.hypot(this.velocity.x, this.velocity.y);
    },
  };
}

export function npcCombatTargetPosition(
  movement: NonNullable<SectorNpcState['combatMovement']>,
  npcPositions: ReadonlyMap<string, WorldPoint>,
  playerPosition: WorldPoint | null
): WorldPoint | null {
  return movement.targetKind === 'player'
    ? playerPosition
    : (npcPositions.get(movement.targetId) ?? null);
}

/** Shared NPC combat pursuit and escape dynamics, independent of the sector lifecycle. */
export function advanceNpcCombatMovement(
  world: WorldMap,
  npc: SectorNpcState,
  target: WorldPoint,
  deltaSeconds: number
): void {
  const movement = npc.combatMovement;
  if (!movement || movement.mode === 'engaged') return;
  ensurePhysicalShipVelocity(movement);
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
  const speed = Math.min(targetSpeed, movement.speed + acceleration * deltaSeconds);
  movement.velocity = {
    x: Math.cos(movement.headingRadians) * speed,
    y: Math.sin(movement.headingRadians) * speed,
  };
  const moved = speed * deltaSeconds;
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
  npc.fuel = Math.max(0, npc.fuel - fuelForDistance(moved, npc.fuelUse));
}

const fieldActivityByJob = {
  miner: 'mining',
  salvager: 'salvage',
  patrol: 'patrol',
  freighter: 'trade',
  pirate: 'raiding',
} as const;

export function resumeNpcFieldActivity(npc: SectorNpcState, reason: string): boolean {
  npc.activityId = npc.pirate ? 'raiding' : fieldActivityByJob[npc.job];
  npc.activity = reason;
  return true;
}
