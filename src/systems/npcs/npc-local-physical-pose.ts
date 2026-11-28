import type { ManeuveringShipControls, PhysicalShipState } from '../../core/physical-ship-state';
import { velocityFromHeading } from '../../core/physical-ship-state';
import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import type { ShipFlightPerformance } from '../../core/ship-flight-physics';
import { getShipDefinition, resolveShipCombatMovementStats } from '../ships';
import { ensureNpcInstalledComponents } from './npc-upgrade-service';

export type LocalNpcPhysicalPose = PhysicalShipState & { readonly speed: number };

export function localNpcFlightPerformance(
  npc: SectorNpcState,
  fallback: number
): ShipFlightPerformance {
  const ship = getShipDefinition(npc.shipId);
  return ship
    ? resolveShipCombatMovementStats(ship, ensureNpcInstalledComponents(npc))
    : {
        combatSpeed: fallback,
        turnRateRadiansPerSecond: 1.15,
        accelerationMetersPerSecond2: 30,
      };
}

export function localNpcCruiseSpeed(npc: SectorNpcState, fallback: number): number {
  return localNpcFlightPerformance(npc, fallback).combatSpeed;
}

export function createLocalNpcPhysicalPose(
  position: WorldPoint,
  headingRadians: number,
  speed: number
): LocalNpcPhysicalPose {
  return {
    position: { ...position },
    headingRadians,
    velocity: velocityFromHeading(headingRadians, speed),
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
    longitudinalThrust: 0,
    get speed() {
      return Math.hypot(this.velocity.x, this.velocity.y);
    },
  };
}

export function setLocalNpcPhysicalPose(
  ship: PhysicalShipState,
  position: WorldPoint,
  headingRadians: number,
  velocity: WorldPoint,
  maneuvering?: Partial<ManeuveringShipControls>,
  bounds?: { readonly width: number; readonly height: number }
): void {
  ship.position = bounds
    ? {
        x: Math.max(0, Math.min(bounds.width, position.x)),
        y: Math.max(0, Math.min(bounds.height, position.y)),
      }
    : { ...position };
  ship.headingRadians = headingRadians;
  ship.velocity = { ...velocity };
  ship.turnRateRadiansPerSecond = maneuvering?.turnRateRadiansPerSecond ?? 0;
  ship.angularThrust = maneuvering?.angularThrust ?? 0;
  ship.lateralThrust = maneuvering?.lateralThrust ?? 0;
  ship.longitudinalThrust = maneuvering?.longitudinalThrust ?? 0;
}

export function syncLocalNpcWorkerPose<T extends PhysicalShipState & { npcId: string }>(
  ships: readonly T[],
  npcId: string,
  position: WorldPoint,
  headingRadians: number,
  velocity: WorldPoint,
  maneuvering: Partial<ManeuveringShipControls> | undefined,
  afterSync: (ship: T) => void,
  bounds?: { readonly width: number; readonly height: number }
): void {
  const ship = ships.find((entry) => entry.npcId === npcId);
  if (!ship) return;
  setLocalNpcPhysicalPose(ship, position, headingRadians, velocity, maneuvering, bounds);
  afterSync(ship);
}
