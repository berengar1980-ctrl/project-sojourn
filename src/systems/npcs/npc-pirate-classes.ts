import type { SectorNpcState } from '../../core/npc-types';
import type { WorldLocation, WorldMap, WorldPoint } from '../../core/world-types';

export type PirateClass = 'raider' | 'reaver' | 'marauder';

const ALLOWED_DANGER: Readonly<Record<PirateClass, 0 | 1 | 2 | 3>> = {
  raider: 0,
  reaver: 2,
  marauder: 3,
};

export const PIRATE_CLASS_SHIPS: Readonly<Record<PirateClass, string>> = {
  raider: 'pirate-raider-60m',
  reaver: 'pirate-reaver-80m',
  marauder: 'pirate-marauder-120m',
};

export function pirateClassForIndex(index: number): PirateClass {
  return (['raider', 'reaver', 'marauder'] as const)[index % 3]!;
}

/** Permanent world danger drives enemy composition, not player level scaling. */
export function canPirateOperateAt(pirate: SectorNpcState, danger: number): boolean {
  if (!pirate.pirate) return true;
  return Math.max(0, Math.min(3, danger)) >= ALLOWED_DANGER[pirate.pirateClass ?? 'raider'];
}

export function worldDangerAt(world: WorldMap, point: WorldPoint): 0 | 1 | 2 | 3 {
  let danger = 0;
  for (const region of world.regions) {
    if (Math.hypot(point.x - region.center.x, point.y - region.center.y) <= region.radius) {
      danger = Math.max(danger, region.dangerLevel);
    }
  }
  // Locations override geometry in the immediate port/field area.
  return danger as 0 | 1 | 2 | 3;
}

export function pirateHuntAllowedAt(
  pirate: SectorNpcState,
  location: Pick<WorldLocation, 'dangerLevel'>
): boolean {
  return canPirateOperateAt(pirate, location.dangerLevel);
}
