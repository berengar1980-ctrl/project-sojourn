import { reviewShipContact } from './combat-contact-review';
import { tickNativeSupportingAttacker } from './native-duel-support-tick';
import { runtimeSnapshot } from './strategic-combat-runtime-snapshot';
import {
  captureCareerStrategicCombat,
  stageCareerStrategicCombat,
  type CareerStrategicCombatCheckpoint,
} from './career-strategic-combat-checkpoint';
import { advanceCombatAsteroids } from './combat-asteroid-motion';
import { resolveCombatBystanderContacts } from './combat-bystander-contacts';
import type { StrategicCombatBystander } from './strategic-combat-bystander-types';
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
  MutableCombatant,
} from './strategic-combat-types';
import {
  distance,
  createCombatant,
  createRng,
  hashSeed,
} from './strategic-combat-geometry';
import { runtimeEnemy, runtimeCombatant } from './strategic-combat-runtime';
import { buildCombatArena } from './strategic-combat-arena';
import {
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
  deltaSeconds: number,
  bystanders: readonly StrategicCombatBystander[],
  sharedArenaPhysics = false
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
  if (!sharedArenaPhysics) advanceCombatAsteroids(runtime.arena, dt);
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
  resolveCombatBystanderContacts(runtime.attacker, bystanders);
  resolveCombatBystanderContacts(runtime.defender, bystanders);
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
  arenaOptions?: StrategicCombatArenaOptions,
  externalDefender?: MutableCombatant
): StrategicCombatRuntime {
  const escapeArena = buildCombatArena(attackerSetup, defenderSetup, seed, arenaOptions);
  const random = createRng(seed);
  const runtime: StrategicCombatRuntime = {
    seed,
    randomCalls: 0,
    arena: escapeArena,
    attacker: createCombatant(attackerSetup, 'attacker', escapeArena),
    defender: externalDefender ?? createCombatant(defenderSetup, 'defender', escapeArena),
    random: () => {
      runtime.randomCalls += 1;
      return random();
    },
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
  return runtime;
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
function initializeStrategicCombatLog(
  runtime: StrategicCombatRuntime,
  attackerSetup: StrategicCombatantSetup,
  defenderSetup: StrategicCombatantSetup,
  seed: number
): void {
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
}

export function createStrategicCombatService(
  attackerSetup: StrategicCombatantSetup,
  defenderSetup: StrategicCombatantSetup,
  seed = hashSeed(attackerSetup.id + ':' + defenderSetup.id),
  arenaOptions?: StrategicCombatArenaOptions,
  checkpoint?: CareerStrategicCombatCheckpoint,
  sharedArenaPhysics = false,
  externalDefender?: MutableCombatant
): StrategicCombatService {
  const saved = checkpoint
    ? stageCareerStrategicCombat(checkpoint, attackerSetup, defenderSetup)
    : null;
  const runtime = createStrategicCombatRuntime(
    attackerSetup,
    defenderSetup,
    saved?.seed ?? seed,
    arenaOptions,
    externalDefender
  );
  if (saved) {
    for (let call = 0; call < saved.randomCalls; call += 1) runtime.random();
    const { attacker: storedAttacker, defender: storedDefender, ...state } = saved.runtime;
    Object.assign(runtime, state);
    Object.assign(runtime.attacker, storedAttacker);
    Object.assign(runtime.defender, storedDefender);
  }
  if (!saved && !externalDefender) {
    initializeStrategicCombatLog(runtime, attackerSetup, defenderSetup, seed);
  }
  if (externalDefender) runtime.attacker.nextStrategyReviewAt = 0;
  let bystanders: readonly StrategicCombatBystander[] = [];
  return {
    exportCareerState: () => captureCareerStrategicCombat(runtime),
    getParallelActor: (side) => runtimeCombatant(runtime, side),
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
    setBystanders: (ships) => {
      bystanders = ships;
    },
    tick: (deltaSeconds) => {
      if (externalDefender) {
        tickNativeSupportingAttacker(runtime, deltaSeconds, bystanders);
        return runtimeSnapshot(runtime);
      }
      return tickStrategicCombat(runtime, deltaSeconds, bystanders, sharedArenaPhysics);
    },
  };
}
