import { advanceCombatGrapple, fireCombatGrapple } from './combat-grapple-service';
import { advanceShieldImpacts } from '../shields/shield-service';

import type {
  MutableCombatant,
  StrategicCombatArenaOptions,
  StrategicCombatRuntime,
  StrategicCombatSnapshot,
  StrategicCombatantSetup,
  StrategicCombatService,
} from './strategic-combat-types';

import {
  EDGE_PADDING,
  distance,
  snapshot,
  DEFAULT_ARENA_WIDTH,
  DEFAULT_ARENA_HEIGHT,
  createCombatant,
  createRng,
  hashSeed,
} from './strategic-combat-geometry';

import { runtimeEnemy, runtimeCombatant } from './strategic-combat-runtime';

import {
  mineDetection,
  updateAiTactic,
  moveCombatant,
  resolveCombatantCollision,
  resolveArenaObstacles,
} from './strategic-combat-movement';

import { maybeDropRuntimeMine, advanceRuntimeMines } from './strategic-combat-mines';

import { advanceRuntimeWeapons, advanceRuntimeProjectiles } from './strategic-combat-weapons';

export type { StrategicCombatSide } from './strategic-combat-types';

export type { CombatTactic } from './strategic-combat-types';

export type { CombatImpactLayer } from './strategic-combat-types';

export type { CombatProjectileKind } from './strategic-combat-types';

export type { CombatBeamKind } from './strategic-combat-types';

export type { CombatPoint } from './strategic-combat-types';

export type { CombatShieldGeometry } from './strategic-combat-types';

export type { StrategicCombatantSetup } from './strategic-combat-types';

export type { StrategicCombatantSnapshot } from './strategic-combat-types';

export type { CombatProjectileSnapshot } from './strategic-combat-types';

export type { CombatBeamSnapshot } from './strategic-combat-types';

export type { CombatMineSnapshot } from './strategic-combat-types';

export type { CombatImpactSnapshot } from './strategic-combat-types';

export type { StrategicCombatSnapshot } from './strategic-combat-types';

export type { StrategicCombatObstacle } from './strategic-combat-types';

export type { StrategicCombatArenaOptions } from './strategic-combat-types';

export type { StrategicCombatService } from './strategic-combat-types';

export { createCombatShieldGeometry } from './strategic-combat-geometry';

function runtimeCombatantEscaped(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): boolean {
  if (combatant.tactic !== 'flee') return false;
  if (
    combatant.shieldHp <= 0 &&
    enemy.hullHp > 0 &&
    distance(combatant.position, enemy.position) <= (enemy.setup.tractorRangeMeters ?? 0)
  )
    return false;
  const atExit =
    arena.exitPoint !== undefined && distance(combatant.position, arena.exitPoint) <= 90;
  const safeSeparation = Math.max(350, Math.min(600, arena.width * 0.2));
  return atExit && distance(combatant.position, enemy.position) > safeSeparation;
}

function resolveRuntimeWinner(runtime: StrategicCombatRuntime): void {
  if (runtime.winner) return;
  if (runtime.defender.hullHp <= 0) {
    runtime.winner = 'attacker';
    runtime.lastEvent = runtime.attacker.setup.name + ' gewinnt das Gefecht';
    return;
  }
  if (runtime.attacker.hullHp <= 0) {
    runtime.winner = 'defender';
    runtime.lastEvent = runtime.defender.setup.name + ' gewinnt das Gefecht';
    return;
  }
  if (runtimeCombatantEscaped(runtime.attacker, runtime.defender, runtime.arena)) {
    runtime.winner = 'defender';
    runtime.lastEvent = runtime.attacker.setup.name + ' entkommt aus dem Gefecht';
  } else if (runtimeCombatantEscaped(runtime.defender, runtime.attacker, runtime.arena)) {
    runtime.winner = 'attacker';
    runtime.lastEvent = runtime.defender.setup.name + ' entkommt aus dem Gefecht';
  }
}

function runtimeSnapshot(runtime: StrategicCombatRuntime): StrategicCombatSnapshot {
  return {
    attacker: {
      ...snapshot(runtime.attacker),
      tractorLocked:
        runtime.attacker.shieldHp <= 0 &&
        runtime.defender.hullHp > 0 &&
        distance(runtime.attacker.position, runtime.defender.position) <=
          (runtime.defender.setup.tractorRangeMeters ?? 0),
    },
    defender: {
      ...snapshot(runtime.defender),
      tractorLocked:
        runtime.defender.shieldHp <= 0 &&
        runtime.attacker.hullHp > 0 &&
        distance(runtime.defender.position, runtime.attacker.position) <=
          (runtime.attacker.setup.tractorRangeMeters ?? 0),
    },
    elapsedSeconds: runtime.elapsedSeconds,
    exitPoint: runtime.arena.exitPoint!,
    winner: runtime.winner,
    boardingInitiator: runtime.boardingInitiator,
    grapple: runtime.grapple,
    grappleUsed: { ...runtime.grappleUsed },
    lastEvent: runtime.lastEvent,
    projectiles: runtime.projectiles.map((projectile) => ({
      id: projectile.id,
      owner: projectile.owner,
      kind: projectile.kind,
      family: projectile.family,
      position: { ...projectile.position },
      target: { ...runtimeEnemy(runtime, projectile.owner).position },
      ttlSeconds: projectile.ttlSeconds,
    })),
    beams: runtime.beams.map((beam) => ({
      ...beam,
      origin: { ...beam.origin },
      end: { ...beam.end },
    })),
    mines: runtime.mines.map((mine) => ({
      id: mine.id,
      owner: mine.owner,
      mineId: mine.definition.id,
      kind: mine.definition.kind,
      name: mine.definition.name,
      tier: mine.definition.tier,
      position: { ...mine.position },
      armed: mine.armedSeconds <= 0,
      radius: mine.definition.triggerRadiusMeters,
      detection:
        mine.owner === 'attacker'
          ? 'identified'
          : mineDetection(mine.definition, runtime.attacker, mine.position),
    })),
    lastImpact: runtime.lastImpact,
    arena: { width: runtime.arena.width, height: runtime.arena.height },
  };
}

function advanceRuntimeBeams(runtime: StrategicCombatRuntime, deltaSeconds: number): void {
  for (let index = runtime.beams.length - 1; index >= 0; index -= 1) {
    runtime.beams[index]!.ttlSeconds -= deltaSeconds;
    if (runtime.beams[index]!.ttlSeconds <= 0) runtime.beams.splice(index, 1);
  }
}

function tickStrategicCombat(
  runtime: StrategicCombatRuntime,
  deltaSeconds: number
): StrategicCombatSnapshot {
  if (runtime.winner || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return runtimeSnapshot(runtime);
  }
  const dt = Math.min(deltaSeconds, 0.08);
  runtime.elapsedSeconds += dt;
  if (runtime.grapple) {
    const initiator = runtimeCombatant(runtime, runtime.grapple.owner);
    const victim = runtimeEnemy(runtime, runtime.grapple.owner);
    runtime.grapple = advanceCombatGrapple(
      runtime.grapple,
      initiator.position,
      victim.position,
      dt,
    );
    if (runtime.grapple.success && runtime.grapple.resolved) {
      const fraction = Math.min(1, dt * 2.6);
      victim.position.x += (initiator.position.x - victim.position.x) * fraction;
      victim.position.y += (initiator.position.y - victim.position.y) * fraction;
      victim.speed = 0;
      initiator.speed = 0;
      if (distance(initiator.position, victim.position) <= 140) {
        runtime.boardingInitiator = runtime.grapple.owner;
        runtime.winner = runtime.grapple.owner;
        runtime.lastEvent = 'GREIFHAKEN > SCHIFFE GEKOPPELT · ENTERKAMPF';
      }
    } else if (runtime.grapple.resolved) {
      runtime.lastEvent = 'GREIFHAKEN > AM RUMPF ABGEPRALLT';
      runtime.grapple = null;
    }
    return runtimeSnapshot(runtime);
  }
  runtime.attacker.shieldImpacts = advanceShieldImpacts(runtime.attacker.shieldImpacts, dt);
  runtime.defender.shieldImpacts = advanceShieldImpacts(runtime.defender.shieldImpacts, dt);
  advanceRuntimeBeams(runtime, dt);
  updateAiTactic(runtime.attacker, runtime.defender, runtime.elapsedSeconds);
  updateAiTactic(runtime.defender, runtime.attacker, runtime.elapsedSeconds);
  moveCombatant(runtime.attacker, runtime.defender, 'attacker', dt, runtime.arena, runtime.mines);
  moveCombatant(runtime.defender, runtime.attacker, 'defender', dt, runtime.arena, runtime.mines);
  resolveCombatantCollision(runtime.attacker, runtime.defender);
  resolveArenaObstacles(runtime.attacker, runtime.arena);
  resolveArenaObstacles(runtime.defender, runtime.arena);
  maybeDropRuntimeMine(runtime, 'attacker', runtime.attacker, runtime.defender, dt);
  maybeDropRuntimeMine(runtime, 'defender', runtime.defender, runtime.attacker, dt);
  advanceRuntimeWeapons(runtime, 'attacker', runtime.attacker, runtime.defender, dt);
  advanceRuntimeWeapons(runtime, 'defender', runtime.defender, runtime.attacker, dt);
  advanceRuntimeProjectiles(runtime, dt);
  advanceRuntimeMines(runtime, dt);
  if (runtime.defender.setup.aiControlled && !runtime.attacker.setup.aiControlled &&
      !runtime.grappleUsed.defender && !runtime.grapple &&
      runtime.attacker.shieldHp <= 0 && runtime.attacker.hullHp > 0 &&
      runtime.defender.hullHp > 0 &&
      distance(runtime.attacker.position, runtime.defender.position) <= 900) {
    tryFireGrapple(runtime, 'defender');
  }
  resolveRuntimeWinner(runtime);
  return runtimeSnapshot(runtime);
}

function createStrategicCombatRuntime(
  attackerSetup: StrategicCombatantSetup,
  defenderSetup: StrategicCombatantSetup,
  seed: number,
  arenaOptions?: StrategicCombatArenaOptions
): StrategicCombatRuntime {
  const arena: StrategicCombatArenaOptions = {
    width: Math.max(800, arenaOptions?.width ?? DEFAULT_ARENA_WIDTH),
    height: Math.max(600, arenaOptions?.height ?? DEFAULT_ARENA_HEIGHT),
    ...(arenaOptions?.attackerPosition ? { attackerPosition: arenaOptions.attackerPosition } : {}),
    ...(arenaOptions?.defenderPosition ? { defenderPosition: arenaOptions.defenderPosition } : {}),
    ...(arenaOptions?.obstacles ? { obstacles: arenaOptions.obstacles } : {}),
  };
  const margin = EDGE_PADDING;
  const along = 0.35 + (((seed >>> 5) % 101) / 100) * 0.3;
  const candidates = [
    { x: margin, y: arena.height * along },
    { x: arena.width - margin, y: arena.height * along },
    { x: arena.width * along, y: margin },
    { x: arena.width * along, y: arena.height - margin },
  ];
  const attackerPosition = arenaOptions?.attackerPosition ?? {
    x: arena.width * 0.35,
    y: arena.height * 0.5,
  };
  const defenderPosition = arenaOptions?.defenderPosition ?? {
    x: arena.width * 0.65,
    y: arena.height * 0.5,
  };
  const playerFlees =
    attackerSetup.preferredTactic === 'flee' || defenderSetup.preferredTactic !== 'flee';
  const runner = playerFlees ? attackerPosition : defenderPosition;
  const pursuer = playerFlees ? defenderPosition : attackerPosition;
  const preferredGate = candidates
    .map((point, index) => ({
      point,
      score: distance(point, pursuer) - distance(point, runner) * 0.4 + ((seed + index) % 4) * 2,
    }))
    .sort((a, b) => b.score - a.score)[0]!.point;
  const escapeArena: StrategicCombatArenaOptions = {
    ...arena,
    exitPoint: arenaOptions?.exitPoint ?? preferredGate,
  };
  return {
    arena: escapeArena,
    attacker: createCombatant(attackerSetup, 'attacker', escapeArena),
    defender: createCombatant(defenderSetup, 'defender', escapeArena),
    random: createRng(seed),
    projectiles: [],
    beams: [],
    mines: [],
    elapsedSeconds: 0,
    winner: null,
    boardingInitiator: null,
    grapple: null,
    grappleUsed: { attacker: false, defender: false },
    lastEvent: 'Kampfkontakt hergestellt',
    projectileSerial: 0,
    beamSerial: 0,
    mineSerial: 0,
    impactSerial: 0,
    lastImpact: null,
  };
}

function tryFireGrapple(
  runtime: StrategicCombatRuntime,
  side: 'attacker' | 'defender',
): boolean {
  if (runtime.winner || runtime.grapple || runtime.grappleUsed[side]) return false;
  const attacker = runtimeCombatant(runtime, side);
  const victim = runtimeEnemy(runtime, side);
  if (distance(attacker.position, victim.position) > 900) return false;
  const launched = fireCombatGrapple(
    side,
    attacker.position,
    victim.position,
    victim.shieldHp,
    victim.hullHp,
    victim.hullMaxHp,
    false,
    runtime.random,
  );
  if (!launched) return false;
  runtime.grappleUsed[side] = true;
  runtime.grapple = launched;
  runtime.lastEvent = launched.success
    ? 'GREIFHAKEN > TREFFER · ZIEL WIRD HERANGEZOGEN'
    : 'GREIFHAKEN > WURF ABGEFEUERT';
  return true;
}

export function createStrategicCombatService(
  attackerSetup: StrategicCombatantSetup,
  defenderSetup: StrategicCombatantSetup,
  seed = hashSeed(attackerSetup.id + ':' + defenderSetup.id),
  arenaOptions?: StrategicCombatArenaOptions
): StrategicCombatService {
  const runtime = createStrategicCombatRuntime(attackerSetup, defenderSetup, seed, arenaOptions);
  return {
    getSnapshot: () => runtimeSnapshot(runtime),
    fireGrapple: (side) => tryFireGrapple(runtime, side),
    setTactic(side, tactic) {
      const combatant = runtimeCombatant(runtime, side);
      combatant.tactic = tactic;
      runtime.lastEvent = combatant.setup.name + ': Taktik ' + tactic.toUpperCase();
    },
    tick: (deltaSeconds) => tickStrategicCombat(runtime, deltaSeconds),
  };
}
