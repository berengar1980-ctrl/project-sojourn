import type {
  MutableCombatant,
  StrategicCombatArenaOptions,
  StrategicCombatantSnapshot,
} from './strategic-combat-types';
import { snapshot } from './strategic-combat-geometry';
/** Structural contracts avoid an import cycle with the authoritative fleet factory. */
interface FleetWorldSink {
  readonly afterCombatTick?: (
    ships: readonly {
      readonly factionId: string;
      readonly targetId: string | null;
      readonly ship: StrategicCombatantSnapshot;
    }[]
  ) => void;
}

interface FleetLifecycleShip {
  readonly factionId: string;
  readonly combatant: MutableCombatant;
  readonly targetId: string | null;
  readonly spawnAtSeconds: number;
  active: boolean;
  departed: boolean;
}

/** World coordination shared by test harnesses and career entrypoints. */
export function validateFleetScenario(
  participants: readonly { readonly setup: { readonly id: string } }[],
  arena: StrategicCombatArenaOptions
): void {
  if (participants.length < 3) throw new Error('FleetCombat needs at least three ships');
  if (!(arena.width > 0 && arena.height > 0)) throw new Error('Invalid FleetCombat arena');
}

export function activateFleetArrivals(
  fleet: readonly FleetLifecycleShip[],
  elapsedSeconds: number
): string[] {
  const arrivals: string[] = [];
  for (const ship of fleet) {
    if (!ship.active && !ship.departed && ship.spawnAtSeconds <= elapsedSeconds + 1e-8) {
      ship.active = true;
      arrivals.push(ship.combatant.setup.id);
    }
  }
  return arrivals;
}

export function reportFleetCombatToWorld(
  world: FleetWorldSink,
  ships: readonly FleetLifecycleShip[]
): void {
  if (!world.afterCombatTick) return;
  world.afterCombatTick(
    ships.map((ship) => ({
      factionId: ship.factionId,
      targetId: ship.targetId,
      ship: snapshot(ship.combatant),
    }))
  );
}
