import type { SalvageField } from '../../core/salvage-types';
import type { NpcLocalSalvageService } from '../../systems/npcs/npc-local-salvage-service';
import type { SectorNpcState } from '../../core/npc-types';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { NpcLocalMiningService } from '../../systems/npcs/npc-mining-targets';
import type { FleetWorldContact, FleetWorldPose } from './fleet-world-contact-types';
import type { createFleetWorldShieldContacts } from './fleet-world-shield-contacts';

function miningContact(miners: NpcLocalMiningService, id: string, rocks: readonly LocalAsteroid[]) {
  const miner = miners.ships.find((ship) => ship.npcId === id);
  const target =
    miner && (miner.laserActive || miner.phase === 'scanning')
      ? rocks.find((rock) => rock.id === miner.targetAsteroidId)
      : undefined;
  return {
    ...(target && miner?.phase === 'scanning'
      ? { scanTarget: { position: target.position, progress: miner.scanProgress } }
      : {}),
    ...(target && miner?.laserActive
      ? {
          miningTarget: { position: target.position, radius: target.radius },
          ...(miner?.oreCollection ? { oreCollection: miner.oreCollection } : {}),
        }
      : {}),
  };
}

/** Project the real world jobs and native shield contacts for both world and combat canvas. */
export function fleetWorldContacts(
  states: ReadonlyMap<string, { readonly npc: SectorNpcState }>,
  active: (id: string) => boolean,
  pose: (id: string) => FleetWorldPose | null,
  miners: NpcLocalMiningService,
  rocks: readonly LocalAsteroid[],
  salvagers: NpcLocalSalvageService | null,
  field: SalvageField | null,
  shields: ReturnType<typeof createFleetWorldShieldContacts>,
  player: FleetWorldContact | null
): FleetWorldContact[] {
  const contacts: FleetWorldContact[] = [];
  for (const [id, entry] of states) {
    if (!active(id) || entry.npc.hullHp <= 0) continue;
    const position = pose(id);
    if (!position) continue;
    const salvager = salvagers?.ships.find((ship) => ship.npcId === id);
    const wreck =
      salvager && (salvager.salvageActive || salvager.phase === 'scanning')
        ? field?.wrecks.find((part) => part.id === salvager.targetWreckId)
        : undefined;
    contacts.push({
      ...(wreck && salvager
        ? {
            salvageTarget: {
              position: wreck.position,
              radius: wreck.radius,
              scanProgress: salvager.phase === 'scanning' ? salvager.scanProgress : null,
            },
          }
        : {}),
      id,
      name: entry.npc.name,
      shipId: entry.npc.shipId,
      ...position,
      shieldImpacts: shields.get(id),
      ...(entry.npc.pirate && entry.npc.pirateMark ? { pirateMark: entry.npc.pirateMark } : {}),
      ...miningContact(miners, id, rocks),
    });
  }
  return player ? [player, ...contacts] : contacts;
}
