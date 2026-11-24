import type { SectorNpcState } from '../core/npc-types';
import { localFieldDuels } from '../systems/combat/dynamic-fleet-combat';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { careerSalvageDrone, careerSalvagePirates } from './game-controller-salvage-drone-world';
import { reportUnauthorizedWreckSalvage } from './game-controller-salvage-legal-response';
import {
  engageSalvagePirate,
  engageSalvageDronePirate,
} from './game-controller-salvage-pirate-combat';

/** Wire local salvage traffic to existing authoritative career services. */
export function salvageSecurityActions(context: ControllerRuntimeContext) {
  const getNpcCombats = () => {
    const field = context.state.salvageScene?.getField();
    return field
      ? (context.engagements.activeNpcCombatSnapshots?.() ?? []).filter(
          (duel) => duel.arena.backdropSeed === field.seed
        )
      : [];
  };
  return {
    resolveDrone: (field: Parameters<typeof careerSalvageDrone>[1]) =>
      careerSalvageDrone(context, field),
    resolvePirateTraffic: (field: Parameters<typeof careerSalvagePirates>[1]) =>
      careerSalvagePirates(context, field),
    onFreighterExit: (npc: SectorNpcState) => {
      if (npc.homePortId)
        context.economy.sectorNpcs.requestTravel(npc, npc.homePortId, 'Rückflug zum Heimathafen');
    },
    escapedFieldShipIds: () => context.engagements.escapedFieldShipIds(),
    getFleet: () => context.engagements.activePlayerFleet()?.getSnapshot() ?? null,
    getNpcCombats,
    getFieldDuels: () =>
      localFieldDuels(
        [...(context.engagements.finishedFieldCombatSnapshots?.() ?? []), ...getNpcCombats()],
        context.state.embeddedCombat === 'salvage-space'
          ? context.engagements.activePlayerFleet()?.getSnapshot()
          : null
      ),
    onUnauthorizedSalvage: (
      field: Parameters<typeof reportUnauthorizedWreckSalvage>[1],
      wreckId: string
    ) => reportUnauthorizedWreckSalvage(context, field, wreckId),
    onPirateAttack: (
      field: Parameters<typeof engageSalvagePirate>[1],
      pirateId: string,
      targetId: string,
      piratePosition: Parameters<typeof engageSalvagePirate>[4],
      targetPosition: Parameters<typeof engageSalvagePirate>[5]
    ) => engageSalvagePirate(context, field, pirateId, targetId, piratePosition, targetPosition),
    onDroneAttack: (
      field: Parameters<typeof engageSalvageDronePirate>[1],
      pirateId: string,
      piratePosition: Parameters<typeof engageSalvageDronePirate>[3],
      dronePosition: Parameters<typeof engageSalvageDronePirate>[4]
    ) => engageSalvageDronePirate(context, field, pirateId, piratePosition, dronePosition),
  };
}
