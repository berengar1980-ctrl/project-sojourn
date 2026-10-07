import type { SectorNpcState } from '../../core/npc-types';
import { getShipMine } from '../../data/combat/ship-mines';
import type { ShipDefinition } from '../../core/ship-types';
import {
  pilotingDodgeChance,
  sensorWeaponHitChanceBonus,
  weaponCriticalChance,
  weaponCycleTimeMultiplier,
  weaponDamageMultiplier,
} from '../crew/crew-skill-effects';
import type { NavigationService } from '../navigation';
import {
  componentHullBonus,
  componentShieldBonus,
  getShipComponent,
  getShipDefinition,
  resolveShipGameplayStats,
  shipHullMaxHp,
  shipShieldMaxHp,
  type InstalledShipComponents,
} from '../ships';
import {
  npcDefenseReaction,
  npcLooksHostileToPatrol,
  npcMayInitiateAttack,
} from '../npcs/npc-combat-ai';
import { ensureNpcInstalledComponents } from '../npcs/npc-upgrade-service';
import type { NpcSectorService } from '../npcs/npc-sector-service';
import {
  createStrategicCombatService,
  type StrategicCombatArenaOptions,
  type StrategicCombatService,
  type StrategicCombatantSetup,
} from './strategic-combat-service';

const PLAYER_ID = 'player';
const NPC_ATTACK_SCAN_RANGE = 650;
const PIRATE_PLAYER_SCAN_RANGE = 520;
const FLEE_GAIN_REQUIRED = 520;

interface ChaseRecord {
  readonly attackerId: string;
  readonly targetId: string;
  readonly targetKind?: 'npc' | 'player';
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
  syncPlayerPursuitTarget(): void;
  tick(deltaSeconds: number): void;
  activePlayerCombat(): StrategicCombatService | null;
  activePlayerEnemy(): SectorNpcState | null;
  finishPlayerCombat(): void;
}

export interface StarMapEngagementOptions {
  readonly navigation: NavigationService;
  readonly sectorNpcs: NpcSectorService;
  readonly getPlayerShip: () => ShipDefinition;
  readonly getPlayerCombatant: () => StrategicCombatantSetup;
  readonly log: (message: string) => void;
}

function distance(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number }
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function npcWeaponComponents(installed: InstalledShipComponents) {
  return (installed.weapon ?? []).flatMap((id) => {
    const component = getShipComponent('weapon', id);
    return component?.weapon ? [component] : [];
  });
}

function npcCombatSkill(npc: SectorNpcState): number {
  return Math.min(90, 35 + npc.aggression * 0.5);
}

function npcCombatant(npc: SectorNpcState): StrategicCombatantSetup | null {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return null;
  const installed = ensureNpcInstalledComponents(npc);
  const hullMax = shipHullMaxHp(ship, componentHullBonus(installed));
  const shieldMax = shipShieldMaxHp(ship) + componentShieldBonus(installed);
  const skill = npcCombatSkill(npc);
  const sensor = (installed.sensor ?? [])
    .map((id) => getShipComponent('sensor', id))
    .find((component) => component !== null);
  const mineTier = Math.max(1, Math.min(6, resolveShipGameplayStats(ship).maxComponentTier));
  const mineCopies = npc.job === 'patrol' ? 2 : 1;
  const mines = Array.from({ length: mineCopies }).flatMap(() =>
    [
      getShipMine('mine-ion-' + mineTier),
      getShipMine('mine-shaped-charge-' + mineTier),
      getShipMine('mine-hunter-' + mineTier),
    ].filter((mine): mine is NonNullable<typeof mine> => mine !== null)
  );

  return {
    id: npc.id,
    name: npc.name,
    shipId: ship.id,
    shieldHp: Math.max(1, shieldMax),
    hullHp: Math.max(1, Math.min(hullMax, npc.hullHp)),
    weapons: npcWeaponComponents(installed),
    hitChance: 0.68 + sensorWeaponHitChanceBonus(skill),
    dodgeChance: pilotingDodgeChance(skill),
    damageMultiplier: weaponDamageMultiplier(skill),
    criticalChance: weaponCriticalChance(skill),
    cycleTimeMultiplier: weaponCycleTimeMultiplier(skill),
    preferredTactic:
      npcDefenseReaction(npc) === 'flee'
        ? 'flee'
        : npc.job === 'patrol' && npc.aggression >= 82
          ? 'kite'
          : 'fight',
    combatSpeed: Math.max(78, Math.min(145, ship.navigation.cruiseSpeed * 0.27)),
    turnRateRadiansPerSecond: Math.max(0.4, Math.min(0.82, 0.98 - ship.nominalLengthMeters * 0.006)),
    accelerationMetersPerSecond2: Math.max(18, Math.min(36, 44 - ship.nominalLengthMeters * 0.18)),
    mines,
    sensorCrewSkill: skill,
    sensorTier: sensor?.tier ?? 0,
    sensorRangeMeters: sensor ? 1000 : 0,
    sensorRangeMultiplier: sensor ? 1 + Number(sensor.range ?? 0) : 1,
    aiControlled: true,
    aiAggression: npc.aggression,
  };
}

function engagementRange(first: ShipDefinition, second: ShipDefinition): number {
  return Math.max(48, (first.nominalLengthMeters + second.nominalLengthMeters) * 0.35);
}

function pairKey(firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join(':');
}

export function createStarMapEngagementService(
  options: StarMapEngagementOptions
): StarMapEngagementService {
  let playerChase: ChaseRecord | null = null;
  let playerCombat: StrategicCombatService | null = null;
  let playerEnemy: SectorNpcState | null = null;
  const npcChases = new Map<string, ChaseRecord>();
  const backgroundCombats = new Map<string, BackgroundCombat>();
  let attackScanAccumulator = 0;

  function npcById(id: string): SectorNpcState | null {
    return options.sectorNpcs.npcs.find((npc) => npc.id === id) ?? null;
  }

  function reactToAttack(defender: SectorNpcState, attackerId: string): void {
    const playerPosition = options.navigation.getSnapshot().currentPosition;
    const reaction = npcDefenseReaction(defender);
    if (reaction === 'fight') {
      options.sectorNpcs.startPursuit(
        defender,
        'player',
        attackerId,
        playerPosition,
        'Gegenangriff'
      );
      options.log('COMBAT > ' + defender.name.toUpperCase() + ' DREHT ZUM GEGENANGRIFF');
    } else {
      options.sectorNpcs.startFlee(defender, 'player', attackerId, playerPosition, 'Flucht');
      options.log('COMBAT > ' + defender.name.toUpperCase() + ' VERSUCHT ZU FLIEHEN');
    }
  }

  function startNpcAttack(attacker: SectorNpcState, defender: SectorNpcState): void {
    const attackerPosition = options.sectorNpcs.livePosition(attacker);
    const defenderPosition = options.sectorNpcs.livePosition(defender);
    if (
      !options.sectorNpcs.startPursuit(
        attacker,
        'npc',
        defender.id,
        defenderPosition,
        'Abfangverfolgung'
      )
    ) {
      return;
    }

    const reaction = npcDefenseReaction(defender);
    if (reaction === 'fight') {
      options.sectorNpcs.startPursuit(
        defender,
        'npc',
        attacker.id,
        attackerPosition,
        'Gegenangriff'
      );
    } else {
      options.sectorNpcs.startFlee(defender, 'npc', attacker.id, attackerPosition, 'Flucht');
    }

    npcChases.set(attacker.id, {
      attackerId: attacker.id,
      targetId: defender.id,
      targetKind: 'npc',
      initialDistance: distance(attackerPosition, defenderPosition),
    });
    options.log(
      'NPC COMBAT > ' +
        attacker.name.toUpperCase() +
        ' VERFOLGT ' +
        defender.name.toUpperCase()
    );
  }

  function startPirateAttackPlayer(attacker: SectorNpcState): void {
    const attackerPosition = options.sectorNpcs.livePosition(attacker);
    const playerPosition = options.navigation.getSnapshot().currentPosition;
    if (
      !options.sectorNpcs.startPursuit(
        attacker,
        'player',
        PLAYER_ID,
        playerPosition,
        'Korsarenabfang'
      )
    ) {
      return;
    }
    npcChases.set(attacker.id, {
      attackerId: attacker.id,
      targetId: PLAYER_ID,
      targetKind: 'player',
      initialDistance: distance(attackerPosition, playerPosition),
    });
    options.log(
      'KORSARENKONTAKT > ' +
        attacker.name.toUpperCase() +
        ' GEHT AUF ABFANGKURS'
    );
  }

  function scanForNpcAttacks(): void {
    for (const attacker of options.sectorNpcs.npcs) {
      if (!npcMayInitiateAttack(attacker) || npcChases.has(attacker.id)) continue;
      const attackerPosition = options.sectorNpcs.livePosition(attacker);

      if (attacker.pirate && !playerCombat && !playerChase) {
        const playerDistance = distance(
          attackerPosition,
          options.navigation.getSnapshot().currentPosition
        );
        const pirateAlreadyChasingPlayer = [...npcChases.values()].some(
          (chase) => chase.targetKind === 'player'
        );
        if (!pirateAlreadyChasingPlayer && playerDistance <= PIRATE_PLAYER_SCAN_RANGE) {
          startPirateAttackPlayer(attacker);
          continue;
        }
      }

      const target = options.sectorNpcs.npcs
        .filter((candidate) => {
          if (candidate.id === attacker.id || candidate.hullHp <= 0) return false;
          if (attacker.pirate) {
            return (
              !candidate.pirate &&
              ['freighter', 'miner', 'salvager'].includes(candidate.job)
            );
          }
          return npcLooksHostileToPatrol(candidate);
        })
        .map((candidate) => ({
          candidate,
          range: distance(attackerPosition, options.sectorNpcs.livePosition(candidate)),
        }))
        .filter((entry) => entry.range <= NPC_ATTACK_SCAN_RANGE)
        .sort((first, second) => first.range - second.range)[0];
      if (target) startNpcAttack(attacker, target.candidate);
    }
  }

  function beginPlayerCombat(
    target: SectorNpcState,
    arena?: StrategicCombatArenaOptions
  ): void {
    const playerSetup = options.getPlayerCombatant();
    const npcSetup = npcCombatant(target);
    if (!npcSetup) return;

    options.navigation.stopPursuit();
    options.sectorNpcs.markEngaged(target, 'player', PLAYER_ID, 'Gefecht mit Spieler');
    playerCombat = createStrategicCombatService(playerSetup, npcSetup, undefined, arena);
    playerEnemy = target;
    playerChase = null;
    npcChases.delete(target.id);
    options.log('COMBAT > KONTAKT · KAMPF BEGINNT GEGEN ' + target.name.toUpperCase());
  }

  function updatePlayerChase(): void {
    if (!playerChase || playerCombat) return;
    const target = npcById(playerChase.targetId);
    if (!target || target.hullHp <= 0) {
      options.navigation.stopPursuit();
      playerChase = null;
      return;
    }

    const playerPosition = options.navigation.getSnapshot().currentPosition;
    const targetPosition = options.sectorNpcs.livePosition(target);
    const currentDistance = distance(playerPosition, targetPosition);
    const playerShip = options.getPlayerShip();
    const npcShip = getShipDefinition(target.shipId);
    if (!npcShip) return;

    if (currentDistance <= engagementRange(playerShip, npcShip)) {
      beginPlayerCombat(target);
      return;
    }

    if (
      options.sectorNpcs.combatMode(target) === 'flee' &&
      currentDistance >= playerChase.initialDistance + FLEE_GAIN_REQUIRED
    ) {
      options.navigation.stopPursuit();
      options.sectorNpcs.recoverFromCombat(target, 'Flucht gelungen');
      options.log('COMBAT > ZIEL IST ENTKOMMEN');
      playerChase = null;
    }
  }

  function beginBackgroundCombat(attacker: SectorNpcState, defender: SectorNpcState): void {
    const attackerSetup = npcCombatant(attacker);
    const defenderSetup = npcCombatant(defender);
    if (!attackerSetup || !defenderSetup) return;
    const key = pairKey(attacker.id, defender.id);
    options.sectorNpcs.markEngaged(attacker, 'npc', defender.id, 'Gefecht');
    options.sectorNpcs.markEngaged(defender, 'npc', attacker.id, 'Gefecht');
    backgroundCombats.set(key, {
      first: attacker,
      second: defender,
      combat: createStrategicCombatService(attackerSetup, defenderSetup),
    });
    npcChases.delete(attacker.id);
    options.log(
      'NPC COMBAT > KONTAKT · ' +
        attacker.name.toUpperCase() +
        ' VS ' +
        defender.name.toUpperCase()
    );
  }

  function updateNpcChases(): void {
    for (const [attackerId, chase] of [...npcChases]) {
      const attacker = npcById(attackerId);
      if (!attacker || attacker.hullHp <= 0) {
        npcChases.delete(attackerId);
        continue;
      }

      const attackerPosition = options.sectorNpcs.livePosition(attacker);
      const attackerShip = getShipDefinition(attacker.shipId);
      if (!attackerShip) continue;

      if (chase.targetKind === 'player') {
        if (playerCombat) {
          npcChases.delete(attackerId);
          continue;
        }
        const playerPosition = options.navigation.getSnapshot().currentPosition;
        const currentDistance = distance(attackerPosition, playerPosition);
        if (currentDistance <= engagementRange(attackerShip, options.getPlayerShip())) {
          beginPlayerCombat(attacker);
          continue;
        }
        if (currentDistance >= chase.initialDistance + FLEE_GAIN_REQUIRED * 1.4) {
          options.sectorNpcs.recoverFromCombat(attacker, 'Abfangversuch abgebrochen');
          npcChases.delete(attackerId);
        }
        continue;
      }

      const target = npcById(chase.targetId);
      if (!target || target.hullHp <= 0) {
        npcChases.delete(attackerId);
        continue;
      }

      const targetPosition = options.sectorNpcs.livePosition(target);
      const currentDistance = distance(attackerPosition, targetPosition);
      const targetShip = getShipDefinition(target.shipId);
      if (!targetShip) continue;

      if (currentDistance <= engagementRange(attackerShip, targetShip)) {
        beginBackgroundCombat(attacker, target);
        continue;
      }

      if (
        options.sectorNpcs.combatMode(target) === 'flee' &&
        currentDistance >= chase.initialDistance + FLEE_GAIN_REQUIRED
      ) {
        options.sectorNpcs.recoverFromCombat(attacker, 'Abfangversuch abgebrochen');
        options.sectorNpcs.recoverFromCombat(target, 'Flucht gelungen');
        npcChases.delete(attackerId);
      }
    }
  }

  function pirateLoot(pirate: SectorNpcState, victim: SectorNpcState): number {
    let remaining = 10;
    let stolen = 0;
    for (const [resourceId, quantity] of Object.entries(victim.cargo)) {
      if (remaining <= 0) break;
      const aboard = Math.max(0, Math.floor(Number(quantity) || 0));
      const moved = Math.min(aboard, remaining, 1 + ((hashIdForLoot(pirate.id + resourceId)) % 5));
      if (moved <= 0) continue;
      victim.cargo[resourceId] = aboard - moved;
      if (victim.cargo[resourceId] <= 0) delete victim.cargo[resourceId];
      pirate.cargo[resourceId] = Math.max(0, Number(pirate.cargo[resourceId] ?? 0)) + moved;
      remaining -= moved;
      stolen += moved;
    }
    pirate.pirateRaidCooldownSeconds = 18;
    pirate.activityId = 'raiding';
    pirate.activity = stolen > 0 ? 'Beutezug · ' + stolen + ' Frachteinheiten erbeutet' : 'Auf Beutezug';
    return stolen;
  }

  function hashIdForLoot(value: string): number {
    let hash = 2166136261;
    for (const character of value) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function resolveBackgroundCombats(deltaSeconds: number): void {
    for (const [key, entry] of [...backgroundCombats]) {
      const model = entry.combat.tick(deltaSeconds);
      if (!model.winner) continue;

      entry.first.hullHp = Math.round(model.attacker.hullHp);
      entry.second.hullHp = Math.round(model.defender.hullHp);
      const pirateWinner =
        model.winner === 'attacker' && entry.first.pirate
          ? { pirate: entry.first, victim: entry.second }
          : model.winner === 'defender' && entry.second.pirate
            ? { pirate: entry.second, victim: entry.first }
            : null;
      if (pirateWinner) {
        const stolen = pirateLoot(pirateWinner.pirate, pirateWinner.victim);
        options.log(
          'NOTSIGNAL > KORSARENÜBERFALL · ' +
            pirateWinner.pirate.name.toUpperCase() +
            (stolen > 0 ? ' ERBEUTET ' + stolen + ' FRACHTEINHEITEN' : '')
        );
      }
      options.sectorNpcs.recoverFromCombat(entry.first, 'Nach Gefecht');
      options.sectorNpcs.recoverFromCombat(entry.second, 'Nach Gefecht');
      backgroundCombats.delete(key);
      options.log('NPC COMBAT > ' + model.lastEvent.toUpperCase());
    }
  }

  return {
    engageNpcNow(npcId) {
      if (playerCombat) return false;
      const target = npcById(npcId);
      if (!target || target.hullHp <= 0) return false;
      beginPlayerCombat(target);
      return playerCombat !== null;
    },

    engageNpcInArena(npcId, arena) {
      if (playerCombat) return false;
      const target = npcById(npcId);
      if (!target || target.hullHp <= 0) return false;
      beginPlayerCombat(target, arena);
      return playerCombat !== null;
    },

    attackNpc(npcId) {
      if (playerCombat) return false;
      const target = npcById(npcId);
      if (!target || target.hullHp <= 0 || target.combatMovement) return false;
      const playerPosition = options.navigation.getSnapshot().currentPosition;
      const targetPosition = options.sectorNpcs.livePosition(target);
      options.navigation.startPursuit(target.id, targetPosition);
      playerChase = {
        attackerId: PLAYER_ID,
        targetId: target.id,
        initialDistance: distance(playerPosition, targetPosition),
      };
      reactToAttack(target, PLAYER_ID);
      options.log('COMBAT > VERFOLGUNG ' + target.name.toUpperCase());
      return true;
    },

    syncPlayerPursuitTarget() {
      const targetId = options.navigation.getSnapshot().pursuitTargetId;
      if (!targetId) return;
      const target = npcById(targetId);
      if (target) options.navigation.updatePursuitTarget(options.sectorNpcs.livePosition(target));
    },

    tick(deltaSeconds) {
      attackScanAccumulator += Math.max(0, deltaSeconds);
      if (attackScanAccumulator >= 1) {
        attackScanAccumulator = 0;
        scanForNpcAttacks();
      }

      updatePlayerChase();
      updateNpcChases();
      resolveBackgroundCombats(deltaSeconds);

      if (playerCombat) {
        const model = playerCombat.tick(deltaSeconds);
        if (playerEnemy) playerEnemy.hullHp = Math.round(model.defender.hullHp);
      }
    },

    activePlayerCombat() {
      return playerCombat;
    },

    activePlayerEnemy() {
      return playerEnemy;
    },

    finishPlayerCombat() {
      if (!playerCombat || !playerEnemy) return;
      const model = playerCombat.getSnapshot();
      playerEnemy.hullHp = Math.round(model.defender.hullHp);
      options.sectorNpcs.recoverFromCombat(playerEnemy, 'Nach Gefecht');
      playerCombat = null;
      playerEnemy = null;
    },
  };
}
