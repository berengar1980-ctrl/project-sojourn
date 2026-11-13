import { reactToPlayerAttack } from './player-attack-reaction';
import type { SectorNpcState } from '../../core/npc-types';
import type { BoardingOutcome } from '../../core/boarding-types';

import type { ShipDefinition } from '../../core/ship-types';
import type { WorldMap } from '../../core/world-types';
import { canRaidCivilianCargo, pirateMayIntercept } from './pirate-interception-policy';
import { protectedBySafeDestination } from '../navigation/route-safety';

import type { NavigationService } from '../navigation';

import { getShipDefinition } from '../ships';

import {
  npcDefenseReaction,
  npcIsPiratePrey,
  npcLooksHostileToPatrol,
  npcMayInitiateAttack,
} from '../npcs/npc-combat-ai';

import type { NpcSectorService } from '../npcs/npc-sector-service';

import {
  createStrategicCombatService,
  type StrategicCombatArenaOptions,
  type StrategicCombatService,
  type StrategicCombatantSetup,
} from './strategic-combat-service';

import { npcCombatant, settleNpcCombatPirateLoot } from './npc-combatant-setup';
import { distance, engagementRange, pairKey } from './npc-engagement-geometry';

const PLAYER_ID = 'player';

const NPC_ATTACK_SCAN_RANGE = 650;

const FLEE_GAIN_REQUIRED = 520;

interface ChaseRecord {
  readonly attackerId: string;
  readonly targetId: string;
  readonly initialDistance: number;
}

interface BackgroundCombat {
  readonly first: SectorNpcState;
  readonly second: SectorNpcState;
  readonly combat: StrategicCombatService;
}

export interface StarMapEngagementService {
  attackNpc(npcId: string): boolean;
  engageNpcNow(npcId: string): boolean;
  engageNpcInArena(npcId: string, arena: StrategicCombatArenaOptions): boolean;
  engageNpcsInArena(
    attackerId: string,
    defenderId: string,
    arena: StrategicCombatArenaOptions
  ): boolean;
  syncPlayerPursuitTarget(): void;
  tick(deltaSeconds: number): void;
  activePlayerCombat(): StrategicCombatService | null;
  activePlayerEnemy(): SectorNpcState | null;
  finishPlayerCombat(boardingOutcome?: BoardingOutcome): void;
}

export interface StarMapEngagementOptions {
  readonly mayInitiateAttack?: (npc: SectorNpcState) => boolean;
  readonly protectsNpc?: (attacker: SectorNpcState, defender: SectorNpcState) => boolean;
  readonly onPlayerAttack?: (npc: SectorNpcState) => void;
  readonly onPlayerVictory?: (id: string) => void;
  readonly navigation: NavigationService;
  readonly world?: () => WorldMap;
  readonly isPlayerInCampaignSystem?: () => boolean;
  readonly playerProtectedFromPirate?: (npc: SectorNpcState) => boolean;
  readonly sectorNpcs: NpcSectorService;
  readonly getPlayerShip: () => ShipDefinition;
  readonly getPlayerCombatant: () => StrategicCombatantSetup;
  readonly log: (message: string) => void;
}

interface EngagementRuntime {
  readonly options: StarMapEngagementOptions;
  playerChase: ChaseRecord | null;
  playerCombat: StrategicCombatService | null;
  playerEnemy: SectorNpcState | null;
  piratePlayerChase: ChaseRecord | null;
  readonly npcChases: Map<string, ChaseRecord>;
  readonly backgroundCombats: Map<string, BackgroundCombat>;
  attackScanAccumulator: number;
}

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
  arena?: StrategicCombatArenaOptions
): void {
  const playerSetup = runtime.options.getPlayerCombatant();
  const npcSetup = npcCombatant(target);
  if (!npcSetup) return;
  runtime.options.navigation.stopPursuit();
  runtime.options.sectorNpcs.markEngaged(target, 'player', PLAYER_ID, 'Gefecht mit Spieler');
  runtime.playerCombat = createStrategicCombatService(playerSetup, npcSetup, undefined, arena);
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
    beginPlayerCombat(runtime, target);
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
  const key = pairKey(attacker.id, defender.id);
  runtime.options.sectorNpcs.markEngaged(attacker, 'npc', defender.id, 'Gefecht');
  runtime.options.sectorNpcs.markEngaged(defender, 'npc', attacker.id, 'Gefecht');
  runtime.backgroundCombats.set(key, {
    first: attacker,
    second: defender,
    combat: createStrategicCombatService(attackerSetup, defenderSetup, undefined, arena),
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

function resolveBackgroundCombats(runtime: EngagementRuntime, deltaSeconds: number): void {
  for (const [key, entry] of [...runtime.backgroundCombats]) {
    const model = entry.combat.tick(deltaSeconds);
    if (!model.winner) continue;
    entry.first.hullHp = Math.round(model.attacker.hullHp);
    entry.second.hullHp = Math.round(model.defender.hullHp);
    settleNpcCombatPirateLoot(entry.first, entry.second, model.winner);
    runtime.options.sectorNpcs.recoverFromCombat(entry.first, 'Nach Gefecht');
    runtime.options.sectorNpcs.recoverFromCombat(entry.second, 'Nach Gefecht');
    runtime.backgroundCombats.delete(key);
    runtime.options.log('NPC COMBAT > ' + model.lastEvent.toUpperCase());
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
  beginPlayerCombat(runtime, target, arena);
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
    const model = runtime.playerCombat.tick(deltaSeconds);
    if (runtime.playerEnemy) runtime.playerEnemy.hullHp = Math.round(model.defender.hullHp);
  }
}

function finishPlayerCombat(runtime: EngagementRuntime, boardingOutcome?: BoardingOutcome): void {
  if (!runtime.playerCombat || !runtime.playerEnemy) return;
  const model = runtime.playerCombat.getSnapshot();
  runtime.playerEnemy.hullHp = Math.round(model.defender.hullHp);
  if (
    (model.defender.hullHp <= 0 && model.attacker.hullHp > 0) ||
    (model.boardingInitiator !== null && boardingOutcome === 'player_win')
  ) {
    runtime.options.onPlayerVictory?.(runtime.playerEnemy.id);
  }
  if (model.defender.hullHp <= 0) {
    runtime.options.sectorNpcs.recoverFromCombat(runtime.playerEnemy, 'Kampfunfähig');
    runtime.options.log(
      'COMBAT > ' +
        runtime.playerEnemy.name.toUpperCase() +
        ' KAMPFUNFÄHIG · BESATZUNG UND SCHIFF WERDEN GEBORGEN'
    );
  } else {
    const reason =
      boardingOutcome === 'player_win' ? 'Besatzung nach Enterkampf besiegt' : 'Nach Gefecht';
    runtime.options.sectorNpcs.recoverFromCombat(runtime.playerEnemy, reason);
  }
  if (model.attacker.hullHp <= 0) {
    const recovery = runtime.options.navigation.recoverToNearestDock();
    const destination = recovery.currentLocationId ?? 'UNKNOWN';
    runtime.options.log(
      'COMBAT > EIGENES SCHIFF KAMPFUNFÄHIG · BERGUNG NACH ' + destination.toUpperCase()
    );
  }
  runtime.playerCombat = null;
  runtime.playerEnemy = null;
}

export function createStarMapEngagementService(
  options: StarMapEngagementOptions
): StarMapEngagementService {
  const runtime: EngagementRuntime = {
    options,
    playerChase: null,
    playerCombat: null,
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
    activePlayerEnemy: () => runtime.playerEnemy,
    finishPlayerCombat: (boardingOutcome) => finishPlayerCombat(runtime, boardingOutcome),
  };
}
