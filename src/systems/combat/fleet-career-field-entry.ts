import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import type { AsteroidFieldRuntime } from '../operations/asteroid-field-world';
import { miningFieldCombatArena } from './field-combat-arena';
import { createFleetCareerMiningBridge } from './fleet-career-mining-bridge';
import {
  createFleetCombatService,
  type FleetCombatParticipant,
  type FleetCombatService,
} from './fleet-combat-service';

/**
 * Career-side entry into the SAME fleet factory as the PvP scenario editor.
 *
 * The supplied field is the existing AsteroidFieldWorld.field(locationId)
 * object, not a generated field or a copied miner service. Its owning campaign
 * controller MUST suspend its ordinary field.miners.tick while ticking this
 * fleet; createFleetCareerMiningBridge transfers that single tick to FleetCombat.
 *
 * Non-miner participants (player, pirates, drones) must be supplied by their
 * respective career adapters with real positions and equipment. In particular,
 * this entry does not invent combatants or override their navigation.
 */
export function createFleetCombatForCareerField(
  field: AsteroidFieldRuntime,
  careerNpcs: readonly SectorNpcState[],
  otherParticipants: readonly FleetCombatParticipant[],
  playerVelocity: WorldPoint = { x: 0, y: 0 }
): FleetCombatService {
  const localMinerIds = new Set(field.miners.ships.map((ship) => ship.npcId));
  const miners = careerNpcs.filter(
    (npc) =>
      npc.job === 'miner' &&
      npc.locationId === field.locationId &&
      localMinerIds.has(npc.id)
  );
  if (new Set(careerNpcs.map((npc) => npc.id)).size !== careerNpcs.length)
    throw new Error('Duplicate career NPC identity in FleetCombat field handoff');
  if (new Set(otherParticipants.map((entry) => entry.setup.id)).size !== otherParticipants.length)
    throw new Error('Duplicate external participant in FleetCombat field handoff');
  if (otherParticipants.some((entry) => localMinerIds.has(entry.setup.id)))
    throw new Error('Career miner cannot have a second combat movement owner');
  if (otherParticipants.some((entry) => entry.setup.id === 'player' && entry.spawnAtSeconds))
    throw new Error('Career player cannot arrive after the field handoff');
  const bridge = createFleetCareerMiningBridge(field.miners, miners);
  const arena = miningFieldCombatArena(field.instance, playerVelocity, field.combatWrecks);
  return createFleetCombatService(
    [...otherParticipants, ...bridge.participants],
    arena,
    bridge.world
  );
}
