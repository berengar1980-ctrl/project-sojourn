import type { SectorNpcState } from '../../core/npc-types';
import type { NpcCombatMovementMode, NpcCombatTargetKind } from '../../core/npc-types';
import { ensurePhysicalShipVelocity } from '../../core/physical-ship-state';
import {
  applyShipVelocityCommand,
  shipFlightBounds,
  turnShipTowardHeading,
} from '../../core/ship-flight-physics';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import { npcOperationalSpeed } from './npc-upgrade-service';
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
  turnShipTowardHeading(movement, desiredHeading, COMBAT_TURN_RATE, deltaSeconds);
  const baseSpeed = npcOperationalSpeed(npc);
  const targetSpeed = baseSpeed * (away ? 1.05 : 1.08);
  const acceleration = Math.max(15, baseSpeed * 0.85);
  const start = { ...movement.position };
  applyShipVelocityCommand(movement, {
    direction: { x: Math.cos(movement.headingRadians), y: Math.sin(movement.headingRadians) },
    targetSpeed,
    acceleration,
    deltaSeconds,
    maxSpeed: targetSpeed,
    bounds: shipFlightBounds(world.width, world.height),
  });
  const moved = Math.hypot(movement.position.x - start.x, movement.position.y - start.y);
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
