import type { SectorNpcState } from '../../core/npc-types';
import { transferPirateLoot } from './npc-combatant-setup';
import type { FleetCombatShipSnapshot, FleetCombatShotSnapshot } from './fleet-combat-service';

export interface FleetCareerLootResult {
  readonly victimId: string;
  readonly pirateIds: readonly string[];
  readonly unitsTransferred: number;
}

/**
 * Settles one defeated career NPC exactly once. The recorded contributors are
 * actual FleetCombat weapon hits, not mere target selections: two hostile
 * pirate factions therefore share a kill without creating a new alliance.
 *
 * Cargo movement uses the existing 1vs1 career transfer routine, including
 * real inventory/capacity bookkeeping and the pirate activity update.
 */
export function createFleetCareerLootSettlement(
  npcs: readonly SectorNpcState[]
): {
  settle(
    ships: readonly FleetCombatShipSnapshot[],
    shots: readonly FleetCombatShotSnapshot[]
  ): readonly FleetCareerLootResult[];
} {
  const byId = new Map(npcs.map((npc) => [npc.id, npc]));
  const contributors = new Map<string, Map<string, number>>();
  const settled = new Set<string>();

  function record(shots: readonly FleetCombatShotSnapshot[]): void {
    for (const shot of shots) {
      if (settled.has(shot.targetId)) continue;
      const pirate = byId.get(shot.sourceId);
      const victim = byId.get(shot.targetId);
      const damage = Math.max(0, shot.shieldDamage) + Math.max(0, shot.hullDamage);
      if (!pirate?.pirate || !victim || pirate.id === victim.id || damage <= 0) continue;
      let sources = contributors.get(victim.id);
      if (!sources) {
        sources = new Map();
        contributors.set(victim.id, sources);
      }
      sources.set(pirate.id, (sources.get(pirate.id) ?? 0) + damage);
    }
  }

  function divide(victim: SectorNpcState, pirates: readonly SectorNpcState[]): number {
    let remaining = 10;
    let transferred = 0;
    // Alternate one cargo unit at a time to keep the prize shared fairly.
    // No pirate can exceed the capacity enforced by transferPirateLoot.
    while (remaining > 0) {
      let moved = 0;
      for (const pirate of pirates) {
        if (remaining === 0) break;
        const amount = transferPirateLoot(pirate, victim, 1);
        moved += amount;
        transferred += amount;
        remaining -= amount;
      }
      if (moved === 0) break;
    }
    return transferred;
  }

  return {
    settle(ships, shots) {
      record(shots);
      const results: FleetCareerLootResult[] = [];
      for (const ship of ships) {
        const victim = byId.get(ship.ship.id);
        if (!victim || ship.ship.hullHp > 0 || settled.has(victim.id)) continue;
        settled.add(victim.id);
        const sources = contributors.get(victim.id);
        contributors.delete(victim.id);
        if (!sources) continue;
        const participants = [...sources]
          .filter(([id]) =>
            ships.some((entry) => entry.ship.id === id && entry.ship.hullHp > 0)
          )
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([id]) => byId.get(id))
          .filter((pirate): pirate is SectorNpcState => Boolean(pirate?.pirate));
        if (participants.length === 0) continue;
        const unitsTransferred = divide(victim, participants);
        results.push({
          victimId: victim.id,
          pirateIds: participants.map((pirate) => pirate.id),
          unitsTransferred,
        });
      }
      return results;
    },
  };
}
