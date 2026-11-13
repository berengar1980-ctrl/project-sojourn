import { reviewShipContact } from './combat-contact-review';
import { advanceCombatAsteroids } from './combat-asteroid-motion';
import { applyCombatRamImpact } from './combat-ram-impact';
import { advanceCombatPower } from './combat-power-service';
import { resolveRuntimeWinner } from './combat-runtime-winner';
import { pulseCombatTractor } from './combat-tractor-pulse';
import {
  maybeLaunchTractorAsteroid,
  advanceThrownAsteroids,
} from './combat-tractor-asteroid-throw';
import { advanceCombatGrapple, fireCombatGrapple } from './combat-grapple-service';
import { advanceCombatGrappleTether, canDockGrappledShips } from './combat-grapple-physics';
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
  const escapeGate =
    runtime.attacker.escapeGate ?? runtime.defender.escapeGate ?? runtime.arena.exitPoint!;
  return {
    attacker: {
      ...snapshot(runtime.attacker),
      tractorLocked:
        runtime.attacker.shieldHp <= 0 &&
        runtime.defender.hullHp > 0 &&
        runtime.defender.subsystems.tractor > 0 &&
        runtime.defender.powerFault !== 'total' &&
        distance(runtime.attacker.position, runtime.defender.position) <=
          (runtime.defender.setup.tractorRangeMeters ?? 0),
    },
    defender: {
      ...snapshot(runtime.defender),
      tractorLocked:
        runtime.defender.shieldHp <= 0 &&
        runtime.attacker.hullHp > 0 &&
        runtime.attacker.subsystems.tractor > 0 &&
        runtime.attacker.powerFault !== 'total' &&
        distance(runtime.defender.position, runtime.attacker.position) <=
          (runtime.attacker.setup.tractorRangeMeters ?? 0),
    },
    elapsedSeconds: runtime.elapsedSeconds,
    exitPoint: escapeGate,
    winner: runtime.winner,
    outcomeReason: runtime.outcomeReason ?? null,
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
      origin: { ...projectile.origin },
      position: { ...projectile.position },
      target: { ...runtimeEnemy(runtime, projectile.owner).position },
      ttlSeconds: projectile.ttlSeconds,
      direction: { ...projectile.direction },
      missed: projectile.missed === true,
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
    recentImpacts: runtime.recentImpacts.map((impact) => ({
      ...impact,
      position: { ...impact.position },
    })),
    arena: {
      width: runtime.arena.width,
      height: runtime.arena.height,
      obstacles: runtime.arena.obstacles ?? [],
      asteroids: runtime.arena.asteroids ?? [],
      ...(runtime.arena.backdropSeed !== undefined
        ? { backdropSeed: runtime.arena.backdropSeed }
        : {}),
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
  if (runtime.attacker.powerFault !== 'total') {
    maybeLaunchTractorAsteroid(runtime, 'attacker', runtime.attacker, runtime.defender);
  }
  if (runtime.defender.powerFault !== 'total') {
    maybeLaunchTractorAsteroid(runtime, 'defender', runtime.defender, runtime.attacker);
  }
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
/** Grapple is a physical constraint, not an alternate combat update loop. */
function advanceRuntimeGrapple(runtime: StrategicCombatRuntime, dt: number): boolean {
  if (!runtime.grapple) return false;
  const owner = runtime.grapple.owner;
  const initiator = runtimeCombatant(runtime, owner);
  const victim = runtimeEnemy(runtime, owner);
  runtime.grapple = advanceCombatGrapple(runtime.grapple, initiator.position, victim.position, dt);
  if (!runtime.grapple.resolved) return false;
  if (!runtime.grapple.success) {
    runtime.lastEvent = 'GREIFHAKEN > AM RUMPF ABGEPRALLT';
    runtime.grapple = null;
    return false;
  }
  runtime.grapple = advanceCombatGrappleTether(runtime.grapple, initiator, victim, dt);
  if (!canDockGrappledShips(initiator, victim)) return false;
  const sharedX = (initiator.velocity.x + victim.velocity.x) / 2;
  const sharedY = (initiator.velocity.y + victim.velocity.y) / 2;
  initiator.velocity.x = sharedX;
  initiator.velocity.y = sharedY;
  victim.velocity.x = sharedX;
  victim.velocity.y = sharedY;
  initiator.speed = Math.hypot(sharedX, sharedY);
  victim.speed = initiator.speed;
  runtime.boardingInitiator = owner;
  runtime.winner = owner;
  runtime.outcomeReason = 'boarding';
  recordCombatLog(runtime, owner, 'action', 'BOARDING_COUPLED');
  runtime.lastEvent = 'GREIFHAKEN > SCHIFFE GEKOPPELT · ENTERKAMPF';
  return true;
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
  for (const [ship, side] of [
    [runtime.attacker, 'attacker'],
    [runtime.defender, 'defender'],
  ] as const) {
    if (advanceCombatPower(ship, dt)) {
      recordCombatLog(runtime, side, 'state', 'ENERGIEÜBERLAST · ' + ship.powerFault);
    }
  }
  advanceCombatAsteroids(runtime.arena, dt);
  runtime.attacker.shieldImpacts = advanceShieldImpacts(runtime.attacker.shieldImpacts, dt);
  runtime.defender.shieldImpacts = advanceShieldImpacts(runtime.defender.shieldImpacts, dt);
  advanceRuntimeBeams(runtime, dt);
  // The exit is fixed for the duration of a duel; only the flight path detours.
  if (runtime.attacker.powerFault !== 'total') {
    reviewAndExecute(runtime, runtime.attacker, runtime.defender, 'attacker');
  }
  if (runtime.defender.powerFault !== 'total') {
    reviewAndExecute(runtime, runtime.defender, runtime.attacker, 'defender');
  }
  moveCombatant(runtime.attacker, runtime.defender, 'attacker', dt, runtime.arena, runtime.mines);
  moveCombatant(runtime.defender, runtime.attacker, 'defender', dt, runtime.arena, runtime.mines);
  // A connected hook constrains positions, but regular guns and projectiles
  // keep advancing until the hulls physically couple for boarding.
  const boardingCoupled = advanceRuntimeGrapple(runtime, dt);
  if (boardingCoupled) return runtimeSnapshot(runtime);
  // One physical impact resolver for both campaign combat and the exchange duel preset.
  applyCombatRamImpact(runtime);
  reviewShipContact(runtime, (ship, enemy, side) => reviewAndExecute(runtime, ship, enemy, side));
  resolveCombatantCollision(runtime.attacker, runtime.defender);
  resolveArenaObstacles(runtime.attacker, runtime.arena);
  resolveArenaObstacles(runtime.defender, runtime.arena);
  updateCombatAsteroidThrows(runtime, dt);
  if (runtime.attacker.powerFault !== 'total') {
    maybeDropRuntimeMine(runtime, 'attacker', runtime.attacker, runtime.defender, dt);
  }
  if (runtime.defender.powerFault !== 'total') {
    maybeDropRuntimeMine(runtime, 'defender', runtime.defender, runtime.attacker, dt);
  }
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
  maybeAttemptBoarding(runtime, (side) => tryFireGrapple(runtime, side));
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
    outcomeReason: null,
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
    recentImpacts: [],
  };
}
function tryFireGrapple(runtime: StrategicCombatRuntime, side: 'attacker' | 'defender'): boolean {
  if (runtime.winner || runtime.grapple || runtime.grappleUsed[side]) return false;
  if (runtimeCombatant(runtime, side).powerFault === 'total') return false;
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
    resumeAfterBoarding() {
      if (runtime.outcomeReason !== 'boarding' || runtime.boardingInitiator === null) return false;
      if (runtime.attacker.hullHp <= 0 || runtime.defender.hullHp <= 0) return false;
      runtime.winner = null;
      runtime.outcomeReason = null;
      runtime.boardingInitiator = null;
      runtime.grapple = null;
      runtime.grappleUsed.attacker = true;
      runtime.grappleUsed.defender = true;
      const dx = runtime.defender.position.x - runtime.attacker.position.x;
      const dy = runtime.defender.position.y - runtime.attacker.position.y;
      const length = Math.max(0.01, Math.hypot(dx, dy));
      const x = dx / length;
      const y = dy / length;
      runtime.attacker.position.x -= x * 45;
      runtime.attacker.position.y -= y * 45;
      runtime.defender.position.x += x * 45;
      runtime.defender.position.y += y * 45;
      runtime.attacker.strategy = null;
      runtime.defender.strategy = null;
      runtime.lastEvent = 'GREIFHAKEN GELOEST · RAUMGEFECHT FORTGESETZT';
      recordCombatLog(runtime, 'system', 'action', 'BOARDING_RETREAT_RESUMED');
      return true;
    },
    setTactic(side, tactic) {
      const combatant = runtimeCombatant(runtime, side);
      if (runtime.winner) return;
      if (combatant.combatTacticLocked && combatant.tactic === tactic) return;
      combatant.tactic = tactic;
      combatant.combatTacticLocked = true;
      // Player orders have immediate authority over the previous AI plan.
      combatant.strategy = null;
      combatant.nextStrategyReviewAt = runtime.elapsedSeconds;
      delete combatant.flightPass;
      delete combatant.escapeGate;
      delete combatant.escapeAvoidanceSide;
      combatant.asteroidRoute = [];
      combatant.nextAsteroidRouteAt = 0;
      runtime.lastEvent = combatant.setup.name + ': Taktik ' + tactic.toUpperCase();
    },
    surrender(side) {
      if (runtime.winner) return;
      const combatant = runtimeCombatant(runtime, side);
      runtime.winner = side === 'attacker' ? 'defender' : 'attacker';
      runtime.outcomeReason = 'surrender';
      runtime.lastEvent = combatant.setup.name + ' gibt das Gefecht auf';
      recordCombatLog(runtime, side, 'result', 'KAPITULATION · Hülle bleibt unverändert');
    },
    tick: (deltaSeconds) => tickStrategicCombat(runtime, deltaSeconds),
  };
}
