import type { CareerFleetEncounter } from './career-fleet-encounter';
import type { SectorNpcState } from '../../core/npc-types';
import type { BoardingOutcome } from '../../core/boarding-types';
import { settleNpcCombatPirateLoot } from './npc-combatant-setup';
import type { EngagementRuntime } from './star-map-engagement-runtime-types';

function releaseNpc(
  runtime: EngagementRuntime,
  encounter: CareerFleetEncounter | null,
  npc: SectorNpcState,
  reason: string
) {
  const state = encounter?.fleet.getSnapshot();
  const remainInField =
    state?.duels[0]?.arena.backdropSeed !== undefined && !state.escapedShipIds.includes(npc.id);
  runtime.options.sectorNpcs.recoverFromCombat(npc, reason, remainInField);
}

export function resolveBackgroundCombats(runtime: EngagementRuntime, deltaSeconds: number): void {
  for (const [key, entry] of [...runtime.backgroundCombats]) {
    const center = runtime.options.sectorNpcs.livePosition(entry.first);
    entry.fleet.joinNearby(
      center,
      runtime.options.sectorNpcs.npcs,
      (npc) => runtime.options.sectorNpcs.livePosition(npc),
      (npc) => runtime.options.sectorNpcs.markEngaged(npc, 'npc', entry.first.id, 'Flottengefecht')
    );
    entry.fleet.tick(deltaSeconds);
    const model = entry.combat.getSnapshot();
    if (!entry.fleet.fleet.getSnapshot().finished && !model.boardingInitiator) continue;
    // The fleet may have retargeted its original service; actor identity is
    // authoritative, never the mutable attacker/defender slot after promotion.
    const initialPairIntact =
      model.attacker.id === entry.first.id && model.defender.id === entry.second.id;
    if (initialPairIntact) {
      runtime.options.onNpcCombatEnded?.(model, entry.first, entry.second);
      if (model.winner) settleNpcCombatPirateLoot(entry.first, entry.second, model.winner);
    }
    for (const npc of entry.fleet.members.values()) {
      releaseNpc(runtime, entry.fleet, npc, 'Nach Gefecht');
    }
    runtime.backgroundCombats.delete(key);
    runtime.options.log('NPC COMBAT > ' + model.lastEvent.toUpperCase());
  }
}

export function finishPlayerCombat(
  runtime: EngagementRuntime,
  boardingOutcome?: BoardingOutcome
): void {
  if (!runtime.playerCombat || !runtime.playerEnemy) return;
  const model = runtime.playerCombat.getSnapshot();
  // The initial defender can be replaced by a different live fleet opponent.
  // The original NPC already receives its real hull via its unique actor ID.
  if (!runtime.playerFleet) runtime.playerEnemy.hullHp = Math.round(model.defender.hullHp);
  const playerAlive = runtime.playerFleet
    ? (runtime.playerFleet.fleet.getActor('player')?.hullHp ?? 0) > 0
    : model.attacker.hullHp > 0;
  if (
    (runtime.playerEnemy.hullHp <= 0 && playerAlive) ||
    (model.boardingInitiator !== null && boardingOutcome === 'player_win')
  ) {
    runtime.options.onPlayerVictory?.(runtime.playerEnemy.id);
  }
  if (runtime.playerEnemy.hullHp <= 0) {
    runtime.options.sectorNpcs.recoverFromCombat(runtime.playerEnemy, 'Kampfunfähig');
    runtime.options.log(
      'COMBAT > ' +
        runtime.playerEnemy.name.toUpperCase() +
        ' KAMPFUNFÄHIG · BESATZUNG UND SCHIFF WERDEN GEBORGEN'
    );
  } else {
    const reason =
      boardingOutcome === 'player_win' ? 'Besatzung nach Enterkampf besiegt' : 'Nach Gefecht';
    releaseNpc(runtime, runtime.playerFleet, runtime.playerEnemy, reason);
  }
  if (!playerAlive) {
    const recovery = runtime.options.navigation.recoverToNearestDock();
    const destination = recovery.currentLocationId ?? 'UNKNOWN';
    runtime.options.log(
      'COMBAT > EIGENES SCHIFF KAMPFUNFÄHIG · BERGUNG NACH ' + destination.toUpperCase()
    );
  }
  if (runtime.playerFleet) {
    for (const member of runtime.playerFleet.members.values()) {
      if (member !== runtime.playerEnemy)
        releaseNpc(runtime, runtime.playerFleet, member, 'Nach Flottengefecht');
    }
  }
  runtime.playerFleet = null;
  runtime.playerCombat = null;
  runtime.playerEnemy = null;
}
