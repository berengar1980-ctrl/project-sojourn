import { protectedFromPirate } from '../npcs/npc-combat-ai';
import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import { canPirateOperateAt, worldDangerAt } from '../npcs/npc-pirate-classes';
import { protectedBySafeDestination } from '../navigation/route-safety';

/** Normal pirate attacks respect both permanent regional tiers and civilian approaches. */
export function pirateMayIntercept(
  world: WorldMap | undefined,
  pirate: SectorNpcState,
  position: WorldPoint
): boolean {
  return (
    !world ||
    (!protectedBySafeDestination(world, position) &&
      canPirateOperateAt(pirate, worldDangerAt(world, position)))
  );
}

/** Raid only loaded vessels that are actually travelling or operating at a field. */
export function canRaidCivilianCargo(
  world: WorldMap | undefined,
  pirate: SectorNpcState,
  civilian: SectorNpcState,
  position: WorldPoint
): boolean {
  const cargoUnits = Object.values(civilian.cargo).reduce(
    (total, units) => total + Math.max(0, Number(units) || 0),
    0
  );
  return (
    pirateMayIntercept(world, pirate, position) &&
    !protectedFromPirate(pirate, civilian) &&
    cargoUnits > 0 &&
    (Boolean(civilian.travel) || civilian.autonomy?.phase === 'working')
  );
}
