import type { SectorNpcState } from '../../core/npc-types';
import type { NpcLocalMiningService } from '../npcs/npc-local-mining-service';
import {
  createFleetCareerNpcParticipant,
} from './fleet-career-npc-adapter';
import type {
  FleetCombatParticipant,
  FleetCombatWorldOptions,
} from './fleet-combat-service';

/** Attach the actual campaign local-miner world, not a PvP mining simulation.
 * The career world remains the sole movement, navigation, scanning, ore,
 * cargo, event and collision authority. Use the returned tickWorld as the
 * SINGLE owner of the miner service tick while the fleet scene is active.
 */
export function createFleetCareerMiningBridge(
  mining: NpcLocalMiningService,
  miners: readonly SectorNpcState[]
): {
  readonly participants: readonly FleetCombatParticipant[];
  readonly world: FleetCombatWorldOptions;
} {
  const participants = miners.map((npc) => {
    if (npc.job !== 'miner') throw new Error('Fleet miner bridge requires career miners');
    const local = mining.ships.find((ship) => ship.npcId === npc.id);
    if (!local) throw new Error('Career miner is not present in local field: ' + npc.id);
    const participant = createFleetCareerNpcParticipant(npc, local.position, {
      headingRadians: local.headingRadians,
      targetId: null,
    });
    return {
      ...participant,
      externalMovement(_dt: number) {
        const ship = mining.ships.find((entry) => entry.npcId === npc.id);
        if (!ship) throw new Error('Career miner left the active field: ' + npc.id);
        return {
          position: { ...ship.position },
          headingRadians: ship.headingRadians,
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
