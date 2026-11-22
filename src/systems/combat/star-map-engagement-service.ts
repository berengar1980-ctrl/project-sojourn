import { reactToPlayerAttack } from './player-attack-reaction';
import { createCareerFleetEncounter, createNpcFleetEncounter } from './career-fleet-encounter';
import type {
  StarMapEngagementService,
  StarMapEngagementOptions,
} from './star-map-engagement-contract';
export type {
  StarMapEngagementService,
  StarMapEngagementOptions,
} from './star-map-engagement-contract';
import type { SectorNpcState } from '../../core/npc-types';
import type { EngagementRuntime } from './star-map-engagement-runtime-types';

import { canRaidCivilianCargo, pirateMayIntercept } from './pirate-interception-policy';
import { protectedBySafeDestination } from '../navigation/route-safety';

import { getShipDefinition } from '../ships';

import {
  npcDefenseReaction,
  npcIsPiratePrey,
  npcLooksHostileToPatrol,
  npcMayInitiateAttack,
  rivalPirateGroups,
} from '../npcs/npc-combat-ai';

import {
  type StrategicCombatArenaOptions,
  type StrategicCombatService,
} from './strategic-combat-service';

import { npcCombatant } from './npc-combatant-setup';
import {
  finishPlayerCombat,
  resolveBackgroundCombats,
} from './star-map-engagement-fleet-resolution';
import { distance, engagementRange, pairKey } from './npc-engagement-geometry';

const PLAYER_ID = 'player';

const NPC_ATTACK_SCAN_RANGE = 650;

const FLEE_GAIN_REQUIRED = 520;

function engagementNpc(runtime: EngagementRuntime, id: string): SectorNpcState | null {
  return runtime.options.sectorNpcs.npcs.find((npc) => npc.id === id) ?? null;
}

function startNpcAttack(
  runtime: EngagementRuntime,
  attacker: SectorNpcState,
  defender: SectorNpcState
): void {
  const attackerPosition = runtime.options.sectorNpcs.livePosition(attacker);
  const defenderPosition = runtime.options.sectorNpcs.livePosition(defender);
  if (
    !runtime.options.sectorNpcs.startPursuit(
      attacker,
      'npc',
      defender.id,
      defenderPosition,
      'Abfangverfolgung'
    )
  ) {
    return;
  }

  if (npcDefenseReaction(defender) === 'fight') {
    runtime.options.sectorNpcs.startPursuit(
      defender,
      'npc',
      attacker.id,
      attackerPosition,
      'Gegenangriff'
    );
  } else {
    runtime.options.sectorNpcs.startFlee(defender, 'npc', attacker.id, attackerPosition, 'Flucht');
  }

  runtime.npcChases.set(attacker.id, {
    attackerId: attacker.id,
    targetId: defender.id,
    initialDistance: distance(attackerPosition, defenderPosition),
  });
  runtime.options.log(
    'NPC COMBAT > ' + attacker.name.toUpperCase() + ' VERFOLGT ' + defender.name.toUpperCase()
  );
}

function scanForPiratePlayerAttack(runtime: EngagementRuntime): void {
  if (runtime.options.isPlayerInCampaignSystem?.()) return;
  if (runtime.playerCombat || runtime.playerChase || runtime.piratePlayerChase) return;
  const navigation = runtime.options.navigation.getSnapshot();
  if (!navigation.isTravelling || navigation.isPursuing) return;
  const world = runtime.options.world?.();
  if (world && protectedBySafeDestination(world, navigation.currentPosition)) return;
  const target = runtime.options.sectorNpcs.npcs
    .filter(
      (npc) =>
        npc.pirate &&
        runtime.options.mayInterceptPlayer?.(npc) !== false &&
        pirateMayIntercept(world, npc, navigation.currentPosition) &&
        runtime.options.mayInitiateAttack?.(npc) !== false &&
        npcMayInitiateAttack(npc) &&
        !runtime.options.playerProtectedFromPirate?.(npc)
    )
    .map((npc) => ({
      npc,
      range: distance(runtime.options.sectorNpcs.livePosition(npc), navigation.currentPosition),
    }))
    .filter((entry) => entry.range <= NPC_ATTACK_SCAN_RANGE)
    .sort((first, second) => first.range - second.range)[0];
  if (!target) return;
  if (
    !runtime.options.sectorNpcs.startPursuit(
      target.npc,
      'player',
      PLAYER_ID,
      navigation.currentPosition,
      'Korsaren-Abfangkurs'
    )
  ) {
    return;
  }
  runtime.piratePlayerChase = {
    attackerId: target.npc.id,
    targetId: PLAYER_ID,
    initialDistance: target.range,
  };
  runtime.options.log('COMBAT > KORSAREN-ABFANGKURS · ' + target.npc.name.toUpperCase());
}

function npcAttackTarget(
  runtime: EngagementRuntime,
  attacker: SectorNpcState
): SectorNpcState | null {
  const attackerPosition = runtime.options.sectorNpcs.livePosition(attacker);
  const world = runtime.options.world?.();
  return (
    runtime.options.sectorNpcs.npcs
      .filter((candidate) => {
        if (candidate.id === attacker.id || runtime.options.protectsNpc?.(attacker, candidate))
          return false;
        if (!attacker.pirate) return npcLooksHostileToPatrol(candidate);
        if (rivalPirateGroups(attacker, candidate)) {
          return (
            candidate.hullHp > 0 &&
            !candidate.combatMovement &&
            (candidate.combatRecoverySeconds ?? 0) <= 0
          );
        }
        // Keep existing target filters, but use the same geographic policy as player interception.
        if (!npcIsPiratePrey(candidate)) return false;
        return canRaidCivilianCargo(
          world,
          attacker,
          candidate,
          runtime.options.sectorNpcs.livePosition(candidate)
        );
      })
      .map((candidate) => ({
        candidate,
        range: distance(attackerPosition, runtime.options.sectorNpcs.livePosition(candidate)),
        priority: !attacker.pirate && candidate.pirate ? 0 : 1,
      }))
      .filter((entry) => entry.range <= NPC_ATTACK_SCAN_RANGE)
      .sort((first, second) => first.priority - second.priority || first.range - second.range)[0]
      ?.candidate ?? null
  );
}

function scanForNpcAttacks(runtime: EngagementRuntime): void {
  for (const attacker of runtime.options.sectorNpcs.npcs) {
    if (
      runtime.options.mayInitiateAttack?.(attacker) === false ||
      !npcMayInitiateAttack(attacker) ||
      runtime.npcChases.has(attacker.id)
    )
      continue;
    const target = npcAttackTarget(runtime, attacker);
    if (target) startNpcAttack(runtime, attacker, target);
  }
}

function beginPlayerCombat(
  runtime: EngagementRuntime,
  target: SectorNpcState,
  arena?: StrategicCombatArenaOptions,
  playerInitiated = false
): void {
  const playerSetup = runtime.options.getPlayerCombatant();
  const npcSetup = npcCombatant(target);
  if (!npcSetup) return;
  runtime.options.navigation.stopPursuit();
  runtime.options.sectorNpcs.markEngaged(target, 'player', PLAYER_ID, 'Gefecht mit Spieler');
  runtime.playerFleet = createCareerFleetEncounter(
    playerSetup,
    target,
    runtime.options.sectorNpcs.npcs,
    playerInitiated,
    arena
  );
  runtime.playerCombat = runtime.playerFleet.combat;
  runtime.playerEnemy = target;
  runtime.playerChase = null;
  runtime.options.log('COMBAT > KONTAKT · KAMPF BEGINNT GEGEN ' + target.name.toUpperCase());
}

function updatePiratePlayerChase(runtime: EngagementRuntime): void {
  const chase = runtime.piratePlayerChase;
  if (!chase || runtime.playerCombat) return;
  const pirate = engagementNpc(runtime, chase.attackerId);
  if (!pirate || pirate.hullHp <= 0) {
    runtime.piratePlayerChase = null;
    return;
  }
  const playerPosition = runtime.options.navigation.getSnapshot().currentPosition;
  const piratePosition = runtime.options.sectorNpcs.livePosition(pirate);
  const pirateShip = getShipDefinition(pirate.shipId);
  const playerShip = runtime.options.getPlayerShip();
  if (!pirateShip) return;
  const currentDistance = distance(piratePosition, playerPosition);
  if (currentDistance <= engagementRange(pirateShip, playerShip)) {
    runtime.piratePlayerChase = null;
    beginPlayerCombat(runtime, pirate);
    return;
  }
  if (currentDistance >= NPC_ATTACK_SCAN_RANGE * 2.2) {
    runtime.options.sectorNpcs.recoverFromCombat(pirate, 'Beute außer Reichweite');
    runtime.piratePlayerChase = null;
  }
}

function updatePlayerChase(runtime: EngagementRuntime): void {
  const chase = runtime.playerChase;
  if (!chase || runtime.playerCombat) return;
  const target = engagementNpc(runtime, chase.targetId);
  if (!target || target.hullHp <= 0) {
    runtime.options.navigation.stopPursuit();
    runtime.playerChase = null;
    return;
  }

  const playerPosition = runtime.options.navigation.getSnapshot().currentPosition;
  const targetPosition = runtime.options.sectorNpcs.livePosition(target);
  const currentDistance = distance(playerPosition, targetPosition);
  const playerShip = runtime.options.getPlayerShip();
  const npcShip = getShipDefinition(target.shipId);
  if (!npcShip) return;
  if (currentDistance <= engagementRange(playerShip, npcShip)) {
    beginPlayerCombat(runtime, target, undefined, true);
    return;
  }
  if (
    runtime.options.sectorNpcs.combatMode(target) === 'flee' &&
    currentDistance >= chase.initialDistance + FLEE_GAIN_REQUIRED
  ) {
    runtime.options.navigation.stopPursuit();
    runtime.options.sectorNpcs.recoverFromCombat(target, 'Flucht gelungen');
    runtime.options.log('COMBAT > ZIEL IST ENTKOMMEN');
    runtime.playerChase = null;
  }
}

function beginBackgroundCombat(
  runtime: EngagementRuntime,
  attacker: SectorNpcState,
  defender: SectorNpcState,
  arena?: StrategicCombatArenaOptions
): void {
  const attackerSetup = npcCombatant(attacker);
  const defenderSetup = npcCombatant(defender);
  if (!attackerSetup || !defenderSetup) return;
  const fleet = createNpcFleetEncounter(attacker, defender, runtime.options.sectorNpcs.npcs, arena);
  const key = pairKey(attacker.id, defender.id);
  runtime.options.sectorNpcs.markEngaged(attacker, 'npc', defender.id, 'Gefecht');
  runtime.options.sectorNpcs.markEngaged(defender, 'npc', attacker.id, 'Gefecht');
  runtime.backgroundCombats.set(key, {
    first: attacker,
    second: defender,
    combat: fleet.combat,
    fleet,
  });
  runtime.npcChases.delete(attacker.id);
  runtime.options.log(
    'NPC COMBAT > KONTAKT · ' + attacker.name.toUpperCase() + ' VS ' + defender.name.toUpperCase()
  );
}

function updateNpcChases(runtime: EngagementRuntime): void {
  for (const [attackerId, chase] of [...runtime.npcChases]) {
    const attacker = engagementNpc(runtime, attackerId);
    const target = engagementNpc(runtime, chase.targetId);
    if (!attacker || !target || attacker.hullHp <= 0 || target.hullHp <= 0) {
      runtime.npcChases.delete(attackerId);
      continue;
    }
    const attackerPosition = runtime.options.sectorNpcs.livePosition(attacker);
    const targetPosition = runtime.options.sectorNpcs.livePosition(target);
    const currentDistance = distance(attackerPosition, targetPosition);
    const attackerShip = getShipDefinition(attacker.shipId);
    const targetShip = getShipDefinition(target.shipId);
    if (!attackerShip || !targetShip) continue;
    if (currentDistance <= engagementRange(attackerShip, targetShip)) {
      beginBackgroundCombat(runtime, attacker, target);
      continue;
    }
    if (
      runtime.options.sectorNpcs.combatMode(target) === 'flee' &&
      currentDistance >= chase.initialDistance + FLEE_GAIN_REQUIRED
    ) {
      runtime.options.sectorNpcs.recoverFromCombat(attacker, 'Abfangversuch abgebrochen');
      runtime.options.sectorNpcs.recoverFromCombat(target, 'Flucht gelungen');
      runtime.npcChases.delete(attackerId);
    }
  }
}

function engageNpc(
  runtime: EngagementRuntime,
  npcId: string,
  arena?: StrategicCombatArenaOptions
): boolean {
  if (runtime.playerCombat || runtime.options.isPlayerInCampaignSystem?.()) return false;
  const target = engagementNpc(runtime, npcId);
  if (!target || target.hullHp <= 0) return false;
  runtime.options.onPlayerAttack?.(target);
  beginPlayerCombat(runtime, target, arena, true);
  return runtime.playerCombat !== null;
}

function attackNpc(runtime: EngagementRuntime, npcId: string): boolean {
  if (runtime.playerCombat) return false;
  const target = engagementNpc(runtime, npcId);
  if (!target || target.hullHp <= 0 || target.combatMovement) return false;
  const playerPosition = runtime.options.navigation.getSnapshot().currentPosition;
  const targetPosition = runtime.options.sectorNpcs.livePosition(target);
  runtime.options.onPlayerAttack?.(target);
  runtime.options.navigation.startPursuit(target.id, targetPosition);
  runtime.playerChase = {
    attackerId: PLAYER_ID,
    targetId: target.id,
    initialDistance: distance(playerPosition, targetPosition),
  };
  reactToPlayerAttack(runtime.options, target, PLAYER_ID);
  runtime.options.log('COMBAT > VERFOLGUNG ' + target.name.toUpperCase());
  return true;
}

function syncPlayerPursuitTarget(runtime: EngagementRuntime): void {
  const targetId = runtime.options.navigation.getSnapshot().pursuitTargetId;
  if (!targetId) return;
  const target = engagementNpc(runtime, targetId);
  if (target) {
    runtime.options.navigation.updatePursuitTarget(runtime.options.sectorNpcs.livePosition(target));
  }
}

function tickEngagements(runtime: EngagementRuntime, deltaSeconds: number): void {
  if (runtime.options.isPlayerInCampaignSystem?.()) {
    resolveBackgroundCombats(runtime, deltaSeconds);
    return;
  }
  runtime.attackScanAccumulator += Math.max(0, deltaSeconds);
  if (runtime.attackScanAccumulator >= 1) {
    runtime.attackScanAccumulator = 0;
    scanForPiratePlayerAttack(runtime);
    scanForNpcAttacks(runtime);
  }
  updatePiratePlayerChase(runtime);
  updatePlayerChase(runtime);
  updateNpcChases(runtime);
  resolveBackgroundCombats(runtime, deltaSeconds);
  if (runtime.playerCombat) {
    if (runtime.playerFleet) {
      runtime.playerFleet.joinNearby(
        runtime.options.navigation.getSnapshot().currentPosition,
        runtime.options.sectorNpcs.npcs,
        (npc) => runtime.options.sectorNpcs.livePosition(npc),
        (npc) => runtime.options.sectorNpcs.markEngaged(npc, 'player', PLAYER_ID, 'Flottengefecht')
      );
      runtime.playerFleet.tick(deltaSeconds);
    } else {
      const model = runtime.playerCombat.tick(deltaSeconds);
      if (runtime.playerEnemy) runtime.playerEnemy.hullHp = Math.round(model.defender.hullHp);
    }
  }
}

export function createStarMapEngagementService(
  options: StarMapEngagementOptions
): StarMapEngagementService {
  const runtime: EngagementRuntime = {
    options,
    playerChase: null,
    playerCombat: null,
    playerFleet: null,
    playerEnemy: null,
    piratePlayerChase: null,
    npcChases: new Map(),
    backgroundCombats: new Map(),
    attackScanAccumulator: 0,
  };

  return {
    engageNpcNow: (npcId) => engageNpc(runtime, npcId),
    engageNpcInArena: (npcId, arena) => engageNpc(runtime, npcId, arena),
    engageNpcsInArena: (attackerId, defenderId, arena) => {
      if (attackerId === defenderId) return false;
      const attacker = engagementNpc(runtime, attackerId);
      const defender = engagementNpc(runtime, defenderId);
      if (
        !attacker ||
        !defender ||
        attacker.hullHp <= 0 ||
        defender.hullHp <= 0 ||
        attacker.combatMovement ||
        defender.combatMovement ||
        (attacker.combatRecoverySeconds ?? 0) > 0 ||
        (defender.combatRecoverySeconds ?? 0) > 0 ||
        runtime.backgroundCombats.has(pairKey(attackerId, defenderId)) ||
        runtime.options.sectorNpcs.isTravelling(attacker) ||
        runtime.options.sectorNpcs.isTravelling(defender)
      )
        return false;
      beginBackgroundCombat(runtime, attacker, defender, arena);
      return true;
    },
    attackNpc: (npcId) => attackNpc(runtime, npcId),
    syncPlayerPursuitTarget: () => syncPlayerPursuitTarget(runtime),
    tick: (deltaSeconds) => tickEngagements(runtime, deltaSeconds),
    activePlayerCombat: () => runtime.playerCombat,
    activePlayerFleet: () => runtime.playerFleet?.fleet ?? null,
    activeNpcCombatSnapshots: () =>
      [...runtime.backgroundCombats.values()].flatMap((entry) => [
        ...entry.fleet.fleet.getSnapshot().duels,
        ...entry.fleet.fleet.getSnapshot().supporters,
      ]),
    activePlayerEnemy: () => runtime.playerEnemy,
    restorePlayerCareerCombat(combat, enemyId) {
      if (runtime.playerCombat || runtime.playerEnemy) {
        throw new Error('A player combat is already active');
      }
      const enemy = engagementNpc(runtime, enemyId);
      if (!enemy || enemy.hullHp <= 0) throw new Error('Saved combat enemy unavailable');
      const checkpoint = combat.exportCareerState();
      if (checkpoint.defenderId !== enemyId) throw new Error('Career combat enemy mismatch');
      runtime.playerCombat = combat;
      runtime.playerEnemy = enemy;
    },
    finishPlayerCombat: (boardingOutcome) => finishPlayerCombat(runtime, boardingOutcome),
  };
}
