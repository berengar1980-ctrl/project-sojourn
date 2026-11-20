import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import type { NpcLocalMiningService } from '../npcs/npc-local-mining-service';
import { createFleetCareerNpcParticipant } from './fleet-career-npc-adapter';
import type { FleetCombatParticipant, FleetCombatWorldOptions } from './fleet-combat-service';

/** Attach the actual campaign local-miner world, not a PvP mining simulation.
 * The career world remains the sole movement, navigation, scanning, ore,
 * cargo, event and collision authority. Use the returned tickWorld as the
 * SINGLE owner of the miner service tick while the fleet scene is active.
 */
export function createFleetCareerMiningBridge(
  mining: NpcLocalMiningService,
  miners: readonly SectorNpcState[],
  options: {
    readonly spawnAtSeconds?: ReadonlyMap<string, number>;
    readonly spawnPositions?: ReadonlyMap<string, WorldPoint>;
  } = {}
): {
  readonly participants: readonly FleetCombatParticipant[];
  readonly world: FleetCombatWorldOptions;
} {
  const participants = miners.map((npc) => {
    if (npc.job !== 'miner') throw new Error('Fleet miner bridge requires career miners');
    const local = mining.ships.find((ship) => ship.npcId === npc.id);
    const arrival = options.spawnAtSeconds?.get(npc.id) ?? 0;
    const entry = local?.position ?? options.spawnPositions?.get(npc.id);
    if (!entry || (!local && arrival === 0))
      throw new Error('Career miner is not present in local field: ' + npc.id);
    let lastPosition = { ...entry };
    let lastHeading = local?.headingRadians ?? 0;
    let hasArrived = Boolean(local);
    const participant = createFleetCareerNpcParticipant(npc, entry, {
      headingRadians: lastHeading,
      targetId: null,
      spawnAtSeconds: arrival,
    });
    return {
      ...participant,
      externalMovement(_dt: number) {
        const ship = mining.ships.find((candidate) => candidate.npcId === npc.id);
        if (!ship && !hasArrived)
          throw new Error('Scheduled career miner did not enter local field: ' + npc.id);
        if (!ship) {
          return {
            position: { ...lastPosition },
            headingRadians: lastHeading,
            targetId: null,
            active: false,
          };
        }
        hasArrived = true;
        lastPosition = { ...ship.position };
        lastHeading = ship.headingRadians;
        return {
          position: { ...lastPosition },
          headingRadians: lastHeading,
          targetId: null,
        };
      },
    };
  });
  return {
    participants,
    world: { tickWorld: (dt) => mining.tick(dt) },
  };
}
