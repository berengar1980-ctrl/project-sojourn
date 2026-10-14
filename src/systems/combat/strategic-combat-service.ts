import { reviewShipContact } from './combat-contact-review';
import { reviewCombatCommitment } from './combat-commitment';
import { advanceCombatAsteroids } from './combat-asteroid-motion';
import { separateActionShips, applyActionRamImpact } from './combat-exchange-collision';
import { resolveRuntimeWinner } from './combat-runtime-winner';
import { pulseCombatTractor } from './combat-tractor-pulse';
import {
  maybeLaunchTractorAsteroid,
  advanceThrownAsteroids,
} from './combat-tractor-asteroid-throw';
import {
  createActionExchange,
  tickActionExchange,
  type ActiveExchange,
} from './combat-exchange-controller';
import { advanceCombatGrapple, fireCombatGrapple } from './combat-grapple-service';
import { advanceCombatGrappleTether } from './combat-grapple-physics';
import { advanceShieldImpacts } from '../shields/shield-service';
import type {
  StrategicCombatArenaOptions,
  StrategicCombatRuntime,
  StrategicCombatSnapshot,
  StrategicCombatantSetup,
  StrategicCombatService,
} from './strategic-combat-types';
import {
  distance,
  snapshot,
  createCombatant,
  createRng,
  hashSeed,
} from './strategic-combat-geometry';
import { runtimeEnemy, runtimeCombatant } from './strategic-combat-runtime';
import { buildCombatArena } from './strategic-combat-arena';
import {
  mineDetection,
  moveCombatant,
  resolveCombatantCollision,
  resolveArenaObstacles,
} from './strategic-combat-movement';
import { maybeAttemptBoarding } from './combat-boarding-ai';
import {
  recordCombatLog,
  reviewAndExecute,
  recordCommitment,
  recordCombatMotion,
  reviewShieldBreakthroughs,
  reviewSubsystemBreakthroughs,
} from './strategic-combat-telemetry';
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
function runtimeSnapshot(runtime: StrategicCombatRuntime): StrategicCombatSnapshot {
  return {
    attacker: {
      ...snapshot(runtime.attacker),
      tractorLocked:
        runtime.attacker.shieldHp <= 0 &&
        runtime.defender.hullHp > 0 &&
        runtime.defender.subsystems.tractor > 0 &&
        distance(runtime.attacker.position, runtime.defender.position) <=
          (runtime.defender.setup.tractorRangeMeters ?? 0),
    },
    defender: {
      ...snapshot(runtime.defender),
      tractorLocked:
        runtime.defender.shieldHp <= 0 &&
        runtime.attacker.hullHp > 0 &&
        runtime.attacker.subsystems.tractor > 0 &&
        distance(runtime.defender.position, runtime.attacker.position) <=
          (runtime.attacker.setup.tractorRangeMeters ?? 0),
    },
    elapsedSeconds: runtime.elapsedSeconds,
    exitPoint: runtime.arena.exitPoint!,
    winner: runtime.winner,
    boardingInitiator: runtime.boardingInitiator,
    grapple: runtime.grapple
      ? {
          ...runtime.grapple,
          origin: { ...runtime.grapple.origin },
          target: { ...runtime.grapple.target },
        }
      : null,
    grappleUsed: { ...runtime.grappleUsed },
    lastEvent: runtime.lastEvent,
    combatLog: runtime.combatLog.slice(-80).map((entry) => ({ ...entry })),
    projectiles: runtime.projectiles.map((projectile) => ({
      id: projectile.id,
      owner: projectile.owner,
      kind: projectile.kind,
      family: projectile.family,
      position: { ...projectile.position },
      target: { ...runtimeEnemy(runtime, projectile.owner).position },
      ttlSeconds: projectile.ttlSeconds,
      direction: { ...projectile.direction },
    })),
    beams: runtime.beams.map((beam) => ({
      ...beam,
      origin: { ...beam.origin },
      end: { ...beam.end },
    })),
    thrownAsteroids: runtime.thrownAsteroids.map((rock) => ({
      ...rock,
      position: { ...rock.position },
      velocity: { ...rock.velocity },
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
    arena: {
      width: runtime.arena.width,
      height: runtime.arena.height,
      obstacles: runtime.arena.obstacles ?? [],
      asteroids: runtime.arena.asteroids ?? [],
    },
  };
}
function advanceRuntimeBeams(runtime: StrategicCombatRuntime, deltaSeconds: number): void {
  for (let index = runtime.beams.length - 1; index >= 0; index -= 1) {
    runtime.beams[index]!.ttlSeconds -= deltaSeconds;
    if (runtime.beams[index]!.ttlSeconds <= 0) runtime.beams.splice(index, 1);
  }
}
function updateCombatAsteroidThrows(runtime: StrategicCombatRuntime, dt: number): void {
  maybeLaunchTractorAsteroid(runtime, 'attacker', runtime.attacker, runtime.defender);
  maybeLaunchTractorAsteroid(runtime, 'defender', runtime.defender, runtime.attacker);
  advanceThrownAsteroids(runtime, dt);
  pulseCombatTractor(runtime, 'attacker', runtime.attacker, runtime.defender, dt);
  pulseCombatTractor(runtime, 'defender', runtime.defender, runtime.attacker, dt);
}
function recordLatestCombatImpact(runtime: StrategicCombatRuntime): void {
  if (runtime.lastImpact && runtime.lastImpact.serial !== runtime.lastLoggedImpact) {
    runtime.lastLoggedImpact = runtime.lastImpact.serial;
    recordCombatLog(
      runtime,
      runtime.lastImpact.target,
      'impact',
      runtime.lastImpact.layer +
        ' · ' +
        Math.round(runtime.lastImpact.damage) +
        ' HP' +
        (runtime.lastImpact.subsystem ? ' · ' + runtime.lastImpact.subsystem : '')
    );
  }
}
function tickStrategicCombat(
  runtime: StrategicCombatRuntime,
  deltaSeconds: number,
  actionState?: ActiveExchange
): StrategicCombatSnapshot {
  if (runtime.winner || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return runtimeSnapshot(runtime);
  }
  const dt = Math.min(deltaSeconds, 0.08);
  runtime.elapsedSeconds += dt;
  advanceCombatAsteroids(runtime.arena, dt);
  if (runtime.grapple) {
    const initiator = runtimeCombatant(runtime, runtime.grapple.owner);
    const victim = runtimeEnemy(runtime, runtime.grapple.owner);
    runtime.grapple = advanceCombatGrapple(
      runtime.grapple,
      initiator.position,
      victim.position,
      dt
    );
    // The ships keep maneuvering while the hook flies and after it attaches.
    // Momentum is never cleared simply because a grapple was fired.
    moveCombatant(initiator, victim, runtime.grapple.owner, dt, runtime.arena, runtime.mines);
    const victimSide = runtime.grapple.owner === 'attacker' ? 'defender' : 'attacker';
    moveCombatant(victim, initiator, victimSide, dt, runtime.arena, runtime.mines);
    if (runtime.grapple.success && runtime.grapple.resolved) {
      runtime.grapple = advanceCombatGrappleTether(runtime.grapple, initiator, victim, dt);
      if (distance(initiator.position, victim.position) <= 140) {
        // Match the ships' drift at the moment of docking rather than stopping
        // both vessels instantaneously in the middle of space.
        const sharedX = (initiator.velocity.x + victim.velocity.x) / 2;
        const sharedY = (initiator.velocity.y + victim.velocity.y) / 2;
        initiator.velocity.x = sharedX;
        initiator.velocity.y = sharedY;
        victim.velocity.x = sharedX;
        victim.velocity.y = sharedY;
        initiator.speed = Math.hypot(sharedX, sharedY);
        victim.speed = initiator.speed;
        runtime.boardingInitiator = runtime.grapple.owner;
        runtime.winner = runtime.grapple.owner;
        runtime.combatLog.push({
          timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
          side: runtime.grapple.owner,
          event: 'action',
          detail: 'BOARDING_COUPLED',
        });
        runtime.lastEvent = 'GREIFHAKEN > SCHIFFE GEKOPPELT · ENTERKAMPF';
      }
    } else if (runtime.grapple.resolved) {
      runtime.lastEvent = 'GREIFHAKEN > AM RUMPF ABGEPRALLT';
      runtime.grapple = null;
    }
    resolveCombatantCollision(runtime.attacker, runtime.defender);
    resolveArenaObstacles(runtime.attacker, runtime.arena);
    resolveArenaObstacles(runtime.defender, runtime.arena);
    return runtimeSnapshot(runtime);
  }
  runtime.attacker.shieldImpacts = advanceShieldImpacts(runtime.attacker.shieldImpacts, dt);
  runtime.defender.shieldImpacts = advanceShieldImpacts(runtime.defender.shieldImpacts, dt);
  advanceRuntimeBeams(runtime, dt);
  if (actionState) {
    const attackerDecision = reviewCombatCommitment(
      runtime.attacker,
      runtime.defender,
      runtime.arena,
      runtime.elapsedSeconds
    );
    const defenderDecision = reviewCombatCommitment(
      runtime.defender,
      runtime.attacker,
      runtime.arena,
      runtime.elapsedSeconds
    );
    if (attackerDecision) recordCommitment(runtime, 'attacker', attackerDecision);
    if (defenderDecision) recordCommitment(runtime, 'defender', defenderDecision);
    tickActionExchange(runtime, actionState, dt);
  } else {
    reviewAndExecute(runtime, runtime.attacker, runtime.defender, 'attacker');
    reviewAndExecute(runtime, runtime.defender, runtime.attacker, 'defender');
    moveCombatant(runtime.attacker, runtime.defender, 'attacker', dt, runtime.arena, runtime.mines);
    moveCombatant(runtime.defender, runtime.attacker, 'defender', dt, runtime.arena, runtime.mines);
  }
  // One physical impact resolver for both campaign combat and the exchange duel preset.
  applyActionRamImpact(runtime);
  if (!actionState)
    reviewShipContact(runtime, (ship, enemy, side) => reviewAndExecute(runtime, ship, enemy, side));
  resolveCombatantCollision(runtime.attacker, runtime.defender);
  if (actionState) separateActionShips(runtime);
  resolveArenaObstacles(runtime.attacker, runtime.arena);
  resolveArenaObstacles(runtime.defender, runtime.arena);
  updateCombatAsteroidThrows(runtime, dt);
  maybeDropRuntimeMine(runtime, 'attacker', runtime.attacker, runtime.defender, dt);
  maybeDropRuntimeMine(runtime, 'defender', runtime.defender, runtime.attacker, dt);
  const previousShields = [runtime.attacker.shieldHp, runtime.defender.shieldHp];
  const previousSubsystems: [number, number, number, number] = [
    runtime.attacker.subsystems.engine,
    runtime.attacker.subsystems.tractor,
    runtime.defender.subsystems.engine,
    runtime.defender.subsystems.tractor,
  ];
  advanceRuntimeWeapons(runtime, 'attacker', runtime.attacker, runtime.defender, dt);
  advanceRuntimeWeapons(runtime, 'defender', runtime.defender, runtime.attacker, dt);
  advanceRuntimeProjectiles(runtime, dt);
  advanceRuntimeMines(runtime, dt);
  reviewShieldBreakthroughs(runtime, previousShields);
  reviewSubsystemBreakthroughs(runtime, previousSubsystems);
  // The Alpha reference duel tests flight and weapons, not boarding transitions.
  if (!actionState) maybeAttemptBoarding(runtime, (side) => tryFireGrapple(runtime, side));
  recordCombatMotion(runtime);
  resolveRuntimeWinner(runtime);
  recordLatestCombatImpact(runtime);
  if (runtime.winner) recordCombatLog(runtime, 'system', 'result', runtime.lastEvent);
  return runtimeSnapshot(runtime);
}
function createStrategicCombatRuntime(
  attackerSetup: StrategicCombatantSetup,
  defenderSetup: StrategicCombatantSetup,
  seed: number,
  arenaOptions?: StrategicCombatArenaOptions
): StrategicCombatRuntime {
  const escapeArena = buildCombatArena(attackerSetup, defenderSetup, seed, arenaOptions);
  return {
    arena: escapeArena,
    attacker: createCombatant(attackerSetup, 'attacker', escapeArena),
    defender: createCombatant(defenderSetup, 'defender', escapeArena),
    random: createRng(seed),
    projectiles: [],
    beams: [],
    mines: [],
    thrownAsteroids: [],
    elapsedSeconds: 0,
    winner: null,
    boardingInitiator: null,
    grapple: null,
    grappleUsed: { attacker: false, defender: false },
    lastEvent: 'Kampfkontakt hergestellt',
    combatLog: [],
    firstPlanner: seed % 2 === 0 ? 'attacker' : 'defender',
    lastLoggedImpact: 0,
    lastLoggedSampleSecond: -1,
    projectileSerial: 0,
    beamSerial: 0,
    mineSerial: 0,
    impactSerial: 0,
    lastImpact: null,
  };
}
function tryFireGrapple(runtime: StrategicCombatRuntime, side: 'attacker' | 'defender'): boolean {
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
    runtime.random
  );
  if (!launched) return false;
  runtime.grappleUsed[side] = true;
  runtime.grapple = launched;
  runtime.combatLog.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side,
    event: 'action',
    detail: 'BOARDING_ATTEMPT',
  });
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
  const actionState: ActiveExchange | undefined =
    seed === 1001 ? createActionExchange(runtime) : undefined;
  runtime.attacker.nextStrategyReviewAt = runtime.firstPlanner === 'attacker' ? 0 : 4;
  runtime.defender.nextStrategyReviewAt = runtime.firstPlanner === 'defender' ? 0 : 4;
  recordCombatLog(
    runtime,
    'system',
    'start',
    'Seed ' + seed + ' · erste Analyse ' + runtime.firstPlanner
  );
  for (const [side, setup] of [
    ['attacker', attackerSetup],
    ['defender', defenderSetup],
  ] as const) {
    recordCombatLog(
      runtime,
      side,
      'start',
      setup.name +
        ' · Schiff ' +
        setup.shipId +
        ' · Tempo ' +
        (setup.combatSpeed ?? 120) +
        ' · Schild ' +
        setup.shieldHp +
        ' · Hülle ' +
        setup.hullHp +
        ' · Waffen ' +
        setup.weapons
          .map((weapon) => weapon.name + ' (' + (weapon.weapon?.rangeMeters ?? 0) + 'm)')
          .join(', ')
    );
  }
  return {
    getSnapshot: () => runtimeSnapshot(runtime),
    getCombatLog: () => runtime.combatLog.map((entry) => ({ ...entry })),
    fireGrapple: (side) => tryFireGrapple(runtime, side),
    setTactic(side, tactic) {
      const combatant = runtimeCombatant(runtime, side);
      combatant.tactic = tactic;
      combatant.combatTacticLocked = true;
      runtime.lastEvent = combatant.setup.name + ': Taktik ' + tactic.toUpperCase();
    },
    tick: (deltaSeconds) => tickStrategicCombat(runtime, deltaSeconds, actionState),
  };
}
