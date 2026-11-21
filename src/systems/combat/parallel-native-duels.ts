import { advanceCombatAsteroids } from './combat-asteroid-motion';
import { clearCombatSpawn } from './combat-field-spawns';
import { createStrategicCombatService } from './strategic-combat-service';
import type {
  CombatPoint,
  StrategicCombatArenaOptions,
  StrategicCombatantSetup,
  StrategicCombatService,
  StrategicCombatSnapshot,
} from './strategic-combat-types';

/**
 * FIRST INCREMENT ONLY: separate 1vs1 encounters on ONE physical arena.
 * Nothing in this coordinator steers a ship or fires a weapon. Each pair is
 * driven by the production StrategicCombatService unchanged.
 */
export interface NativeDuelShip {
  readonly id: string;
  readonly team: 'a' | 'b';
  readonly setup: StrategicCombatantSetup;
}
export interface ParallelNativeDuelSnapshot {
  readonly duels: readonly StrategicCombatSnapshot[];
  readonly elapsedSeconds: number;
  readonly finished: boolean;
}
export interface ParallelNativeDuels {
  readonly duels: readonly StrategicCombatService[];
  tick(dt: number): ParallelNativeDuelSnapshot;
  getSnapshot(): ParallelNativeDuelSnapshot;
}

function fieldStart(
  arena: StrategicCombatArenaOptions,
  team: 'a' | 'b',
  index: number,
  count: number
): CombatPoint {
  const row = (index + 1) / (count + 1);
  return clearCombatSpawn(arena, {
    x: arena.width * (team === 'a' ? 0.27 : 0.73),
    y: arena.height * row,
  });
}

export function createParallelNativeDuels(
  ships: readonly NativeDuelShip[],
  arena: StrategicCombatArenaOptions,
  seed = 1
): ParallelNativeDuels {
  const first = ships.filter((ship) => ship.team === 'a');
  const second = ships.filter((ship) => ship.team === 'b');
  if (first.length !== 2 || second.length !== 2) {
    throw new Error('Parallel native duel spike currently supports exactly 2 vs 2');
  }
  if (new Set(ships.map((ship) => ship.id)).size !== ships.length) {
    throw new Error('Native duel ship IDs must be unique');
  }

  // The same original generated asteroid/obstacle arrays are passed to BOTH
  // standard duels. The coordinator is their single physical-world tick owner.
  const pairs: StrategicCombatService[] = first.map((ship, index) => {
    const target = second[index]!;
    const attackerPosition = fieldStart(arena, 'a', index, first.length);
    const defenderPosition = fieldStart(arena, 'b', index, second.length);
    return createStrategicCombatService(
      ship.setup,
      target.setup,
      seed + index,
      {
        ...arena,
        attackerPosition,
        defenderPosition,
        attackerHeadingRadians: 0,
        defenderHeadingRadians: Math.PI,
      },
      undefined,
      true
    );
  });
  const getSnapshot = (): ParallelNativeDuelSnapshot => {
    const duels = pairs.map((duel) => duel.getSnapshot());
    return {
      duels,
      elapsedSeconds: Math.max(0, ...duels.map((duel) => duel.elapsedSeconds)),
      finished: duels.every((duel) => duel.winner !== null),
    };
  };

  return {
    duels: pairs,
    getSnapshot,
    tick(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return getSnapshot();
      const dt = Math.min(seconds, 0.08);
      // The asteroid field is integrated exactly ONCE, even with two duels.
      if (!pairs.every((pair) => pair.getSnapshot().winner !== null)) {
        advanceCombatAsteroids(arena, dt);
      }
      for (let index = 0; index < pairs.length; index += 1) {
        const others = pairs
          .filter((_, other) => other !== index)
          .flatMap((duel) => {
            const view = duel.getSnapshot();
            return [view.attacker, view.defender]
              .filter((ship) => ship.hullHp > 0)
              .map((ship) => ({
                id: ship.id,
                shipId: ship.shipId,
                position: ship.position,
                headingRadians: ship.headingRadians,
              }));
          });
        // Native bystander geometry keeps ships from different 1vs1 duels
        // solid. Bystanders are never moved or ticked a second time here.
        pairs[index]!.setBystanders(others);
        pairs[index]!.tick(dt);
      }
      return getSnapshot();
    },
  };
}
