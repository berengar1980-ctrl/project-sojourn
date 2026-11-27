import { snapshot as snapshotCombatant } from './strategic-combat-geometry';
import type { CombatVisualAsteroid, StrategicCombatantSnapshot } from './strategic-combat-types';
import type { StrategicCombatBystander } from './strategic-combat-bystander-types';
import { createCareerFleetEncounter } from './career-fleet-encounter';
import { campaignHullPoints } from './campaign-combat-hull';
import type { StrategicCombatService } from './strategic-combat-service-types';
import { measurePerformance } from '../../core/performance-diagnostics';
import type { StrategicCombatArenaOptions } from './strategic-combat-types';
import type { CareerFleetEncounter } from './career-fleet-encounter';
import type { SectorNpcState } from '../../core/npc-types';
import type { BoardingOutcome } from '../../core/boarding-types';
import { settleNpcCombatPirateLoot } from './npc-combatant-setup';
import type { EngagementRuntime } from './star-map-engagement-runtime-types';

function fieldCombatServices(runtime: EngagementRuntime, locationId: string, seed: number) {
  const services: CareerFleetEncounter[] = [];
  if (
    runtime.playerFleet &&
    runtime.playerFleet.fieldLocationId === locationId &&
    runtime.playerCombat?.getArena().backdropSeed === seed
  )
    services.push(runtime.playerFleet);
  for (const entry of runtime.backgroundCombats.values()) {
    if (
      entry.fleet.fieldLocationId === locationId &&
      entry.combat.getArena().backdropSeed === seed
    ) {
      services.push(entry.fleet);
    }
  }
  return services;
}

/** Check ownership without constructing a full combat snapshot. */
export function hasFieldCombat(
  runtime: EngagementRuntime,
  locationId: string,
  seed: number
): boolean {
  return fieldCombatServices(runtime, locationId, seed).length > 0;
}

export function fieldCombat(
  runtime: EngagementRuntime,
  locationId: string,
  seed: number,
  bystanders?: readonly StrategicCombatBystander[]
) {
  const encounters = fieldCombatServices(runtime, locationId, seed);
  if (bystanders) {
    for (const encounter of encounters) encounter.fleet.setBystanders(bystanders);
  }
  return encounters[0]?.combat.getSnapshot() ?? null;
}

export function prepareFieldCombatArena(
  runtime: EngagementRuntime,
  locationId: string,
  arena?: StrategicCombatArenaOptions
): StrategicCombatArenaOptions | undefined {
  if (arena?.backdropSeed === undefined || !arena.asteroids) return arena;
  const existing = fieldCombatServices(runtime, locationId, arena.backdropSeed)[0];
  const fieldWorld = existing?.combat.getArena().fieldWorld ?? {
    asteroids: [...arena.asteroids],
    removedIds: new Set<string>(),
    advanced: false,
  };
  const blockers = arena.obstacles?.filter((obstacle) => !fieldWorld.removedIds.has(obstacle.id));
  return {
    ...arena,
    asteroids: fieldWorld.asteroids,
    ...(blockers && { obstacles: blockers }),
    fieldWorld,
  };
}

export function registerFieldCombatWreck(
  runtime: EngagementRuntime,
  locationId: string,
  seed: number,
  destroyedId: string,
  body: CombatVisualAsteroid
): void {
  const world = fieldCombatServices(runtime, locationId, seed)[0]?.combat.getArena().fieldWorld;
  if (!world || world.asteroids.some((entry) => entry.id === body.id)) return;
  const oldId = 'fleet-wreck:' + destroyedId;
  const index = world.asteroids.findIndex((entry) => entry.id === oldId);
  if (index >= 0) {
    world.removedIds.add(oldId);
    world.asteroids.splice(index, 1, { ...body, destroyedShipId: destroyedId });
  } else {
    world.asteroids.push(body);
  }
}

export function removeFieldCombatWrecks(
  runtime: EngagementRuntime,
  ids: ReadonlySet<string>
): void {
  const worlds = new Set([
    runtime.playerCombat?.getArena().fieldWorld,
    ...[...runtime.backgroundCombats.values()].map((entry) => entry.combat.getArena().fieldWorld),
  ]);
  for (const world of worlds) {
    if (!world) continue;
    for (let i = world.asteroids.length - 1; i >= 0; i--) {
      const id = world.asteroids[i]!.id;
      if (!ids.has(id)) continue;
      world.asteroids.splice(i, 1);
      world.removedIds.add(id);
    }
  }
}

export function resetFieldCombatSteps(runtime: EngagementRuntime): void {
  const playerWorld = runtime.playerCombat?.getArena().fieldWorld;
  if (playerWorld) playerWorld.advanced = false;
  for (const entry of runtime.backgroundCombats.values()) {
    const world = entry.combat.getArena().fieldWorld;
    if (world) world.advanced = false;
  }
}

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

export function reportFieldFleetLosses(
  runtime: EngagementRuntime,
  encounter: CareerFleetEncounter
): void {
  const losses: StrategicCombatantSnapshot[] = [];
  // Member identity survives retargeting, unlike the mutable duel slots.
  for (const npc of encounter.members.values()) {
    const actor = encounter.fleet.getActor(npc.id);
    if (actor && actor.hullHp <= 0) losses.push(snapshotCombatant(actor));
  }
  if (!losses.length) return;
  runtime.options.onFieldFleetLosses?.(
    encounter.combat.getSnapshot(),
    losses,
    encounter.fieldLocationId
  );
  for (const loss of losses) {
    const npc = encounter.members.get(loss.id);
    if (!npc) continue;
    runtime.options.sectorNpcs.recoverFromCombat(npc, 'Zerstört');
    // A destroyed actor must never write hull damage into its future replacement.
    encounter.detachMember(npc.id);
  }
}

export function reportNpcBoardingResults(
  runtime: EngagementRuntime,
  encounter: CareerFleetEncounter
): void {
  for (const result of encounter.fleet.drainNpcBoardingResults()) {
    const attacker = encounter.members.get(result.attacker.id);
    const defender = encounter.members.get(result.defender.id);
    if (attacker && defender) runtime.options.onNpcCombatEnded?.(result, attacker, defender);
    runtime.options.log('NPC COMBAT > ' + result.lastEvent.toUpperCase());
  }
}

export function resolveBackgroundCombats(runtime: EngagementRuntime, deltaSeconds: number): void {
  for (const [key, entry] of [...runtime.backgroundCombats]) {
    const center = runtime.options.sectorNpcs.livePosition(entry.first);
    measurePerformance('sim.combat.reinforcements', () =>
      entry.fleet.joinNearby(
        center,
        runtime.options.sectorNpcs.npcs,
        (npc) => runtime.options.sectorNpcs.livePosition(npc),
        (npc) =>
          runtime.options.sectorNpcs.markEngaged(npc, 'npc', entry.first.id, 'Flottengefecht')
      )
    );
    measurePerformance('sim.combat.advance', () => entry.fleet.tick(deltaSeconds));
    reportNpcBoardingResults(runtime, entry.fleet);
    reportFieldFleetLosses(runtime, entry.fleet);
    if (!entry.fleet.fleet.isFinished()) continue;
    const model = entry.combat.getSnapshot();
    // The fleet may have retargeted its original service; actor identity is
    // authoritative, never the mutable attacker/defender slot after promotion.
    const initialPairIntact =
      model.attacker.id === entry.first.id && model.defender.id === entry.second.id;
    if (initialPairIntact) {
      runtime.options.onNpcCombatEnded?.(model, entry.first, entry.second);
      if (model.winner && model[model.winner].hullHp > 0)
        settleNpcCombatPirateLoot(entry.first, entry.second, model.winner);
    }
    if (model.arena.backdropSeed !== undefined) {
      const { duels, supporters } = entry.fleet.fleet.getSnapshot();
      runtime.finishedFieldDuels.push(...duels, ...supporters);
    }
    for (const npc of entry.fleet.members.values()) {
      releaseNpc(runtime, entry.fleet, npc, 'Nach Gefecht');
    }
    runtime.backgroundCombats.delete(key);
    runtime.options.onNpcFleetFinished?.();
    runtime.options.log('NPC COMBAT > ' + model.lastEvent.toUpperCase());
  }
}

function releaseFleetMembers(
  runtime: EngagementRuntime,
  fleet: CareerFleetEncounter | null,
  primaryEnemy: SectorNpcState,
  boardingOpponent: SectorNpcState | null
): void {
  if (!fleet) return;
  for (const member of fleet.members.values()) {
    if (member === primaryEnemy) continue;
    const reason =
      member === boardingOpponent ? 'Besatzung nach Enterkampf besiegt' : 'Nach Flottengefecht';
    releaseNpc(runtime, fleet, member, reason);
  }
}

function releasePrimaryEnemy(
  runtime: EngagementRuntime,
  enemy: SectorNpcState,
  boardingOpponent: SectorNpcState | null
): void {
  const primaryStillOwned =
    !runtime.playerFleet || runtime.playerFleet.members.has(enemy.id);
  if (enemy.hullHp <= 0) {
    if (primaryStillOwned) {
      runtime.options.sectorNpcs.recoverFromCombat(enemy, 'Kampfunfähig');
    }
    runtime.options.log(
      'COMBAT > ' +
        enemy.name.toUpperCase() +
        ' KAMPFUNFÄHIG · BESATZUNG UND SCHIFF WERDEN GEBORGEN'
    );
  } else if (primaryStillOwned) {
    const reason =
      boardingOpponent === enemy
        ? 'Besatzung nach Enterkampf besiegt'
        : 'Nach Gefecht';
    releaseNpc(runtime, runtime.playerFleet, enemy, reason);
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
  if (!runtime.playerFleet) {
    runtime.playerEnemy.hullHp = campaignHullPoints(
      model.defender.hullHp,
      runtime.playerEnemy.hullMaxHp
    );
  }
  const playerAlive = runtime.playerFleet
    ? (runtime.playerFleet.fleet.getActor('player')?.hullHp ?? 0) > 0
    : model.attacker.hullHp > 0;
  const boardingOpponent =
    model.boardingInitiator && boardingOutcome === 'player_win'
      ? (runtime.playerFleet?.members.get(model.defender.id) ?? runtime.playerEnemy)
      : null;
  if (boardingOpponent || (runtime.playerEnemy.hullHp <= 0 && playerAlive)) {
    runtime.options.onPlayerVictory?.((boardingOpponent ?? runtime.playerEnemy).id);
  }
  releasePrimaryEnemy(runtime, runtime.playerEnemy, boardingOpponent);
  if (!playerAlive) {
    const recovery = runtime.options.navigation.recoverToNearestDock();
    const destination = recovery.currentLocationId ?? 'UNKNOWN';
    runtime.options.log(
      'COMBAT > EIGENES SCHIFF KAMPFUNFÄHIG · BERGUNG NACH ' + destination.toUpperCase()
    );
  }
  releaseFleetMembers(runtime, runtime.playerFleet, runtime.playerEnemy, boardingOpponent);
  runtime.playerFleet = null;
  runtime.playerCombat = null;
  runtime.playerEnemy = null;
}

export function joinBackgroundCombat(
  runtime: EngagementRuntime,
  target: SectorNpcState,
  arena: StrategicCombatArenaOptions
): boolean {
  for (const [key, entry] of runtime.backgroundCombats) {
    if (!entry.fleet.members.has(target.id)) continue;
    const combat = entry.fleet.joinPlayer(runtime.options.getPlayerCombatant(), target.id, arena);
    if (!combat) return false;
    runtime.backgroundCombats.delete(key);
    runtime.playerFleet = entry.fleet;
    runtime.playerCombat = combat;
    runtime.playerEnemy = target;
    runtime.playerChase = null;
    runtime.options.navigation.stopPursuit();
    runtime.options.onPlayerAttack?.(target);
    runtime.options.log('COMBAT > FLOTTENGEFECHT · ANGRIFF AUF ' + target.name.toUpperCase());
    return true;
  }
  return false;
}

export function restorePlayerFleet(
  runtime: EngagementRuntime,
  combat: StrategicCombatService,
  enemy: SectorNpcState
): void {
  const checkpoint = combat.exportCareerState();
  if (checkpoint.defenderId !== enemy.id) throw new Error('Career combat enemy mismatch');
  const player = combat.getParallelActor?.('attacker');
  if (!player) throw new Error('Saved combat player unavailable');
  const { sectorNpcs, fieldOwnsContact, fieldWitness, navigation } = runtime.options;
  const arena = combat.getArena();
  runtime.playerFleet = createCareerFleetEncounter(
    player.setup,
    enemy,
    sectorNpcs.npcs,
    true,
    arena.backdropSeed === undefined ? undefined : arena,
    {
      ...(fieldOwnsContact && { fieldOwnsContact }),
      ...(fieldWitness && { fieldWitness }),
      positionOf: (npc) => sectorNpcs.livePosition(npc),
      headingOf: (npc) => sectorNpcs.liveHeading(npc),
      playerPosition: navigation.getSnapshot().currentPosition,
    },
    combat
  );
  if (enemy.combatMovement?.mode !== 'engaged') {
    sectorNpcs.markEngaged(enemy, 'player', player.setup.id, 'Gefecht mit Spieler');
  }
  runtime.playerCombat = runtime.playerFleet.combat;
  runtime.playerEnemy = enemy;
}
