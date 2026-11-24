import type { FleetCombatContacts } from './strategic-combat-service-types';
import { reviewShipContact } from './combat-contact-review';
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
import type { StrategicCombatRuntime, StrategicCombatSide } from './strategic-combat-types';
import { distance } from './strategic-combat-geometry';
import { runtimeEnemy, runtimeCombatant } from './strategic-combat-runtime';
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
function advanceRuntimeBeams(runtime: StrategicCombatRuntime, deltaSeconds: number): void {
  for (let index = runtime.beams.length - 1; index >= 0; index -= 1) {
    runtime.beams[index]!.ttlSeconds -= deltaSeconds;
    if (runtime.beams[index]!.ttlSeconds <= 0) runtime.beams.splice(index, 1);
  }
}
const duelSides = ['attacker', 'defender'] as const;

function updateCombatAsteroidThrows(
  runtime: StrategicCombatRuntime,
  dt: number,
  sides: readonly StrategicCombatSide[],
  drivenSide?: StrategicCombatSide
): void {
  for (const side of sides) {
    const ship = runtimeCombatant(runtime, side);
    if (ship.powerFault !== 'total') {
      maybeLaunchTractorAsteroid(runtime, side, ship, runtimeEnemy(runtime, side));
    }
  }
  advanceThrownAsteroids(runtime, dt, drivenSide);
  for (const side of sides) {
    pulseCombatTractor(
      runtime,
      side,
      runtimeCombatant(runtime, side),
      runtimeEnemy(runtime, side),
      dt
    );
  }
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
function advanceRuntimeGrapple(
  runtime: StrategicCombatRuntime,
  dt: number,
  drivenSide?: StrategicCombatSide,
  contacts?: FleetCombatContacts
): boolean {
  if (!runtime.grapple) return false;
  const owner = runtime.grapple.owner;
  if (drivenSide && owner !== drivenSide) return false;
  const initiator = runtimeCombatant(runtime, owner);
  const victim = runtimeEnemy(runtime, owner);
  runtime.grapple = advanceCombatGrapple(runtime.grapple, initiator.position, victim.position, dt);
  if (!runtime.grapple.resolved) return false;
  if (!runtime.grapple.success) {
    runtime.lastEvent = 'GREIFHAKEN > AM RUMPF ABGEPRALLT';
    runtime.grapple = null;
    return false;
  }
  if (contacts?.claimGrapple(initiator.setup.id, victim.setup.id) === false) return false;
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
function advanceCombatContacts(
  runtime: StrategicCombatRuntime,
  bystanders: readonly StrategicCombatBystander[],
  sides: readonly StrategicCombatSide[],
  drivenSide?: StrategicCombatSide,
  contacts?: FleetCombatContacts
): void {
  applyCombatRamImpact(runtime, contacts?.claimRamImpact, contacts?.elapsedSeconds);
  reviewShipContact(
    runtime,
    (ship, enemy, side) => reviewAndExecute(runtime, ship, enemy, side),
    drivenSide
  );
  const separated = resolveCombatantCollision(
    runtime.attacker,
    runtime.defender,
    contacts?.claimHullContact
  );
  for (const side of sides) {
    resolveCombatBystanderContacts(
      runtimeCombatant(runtime, side),
      bystanders,
      contacts?.resolveFleetBystander
    );
  }
  for (const side of sides) resolveArenaObstacles(runtimeCombatant(runtime, side), runtime.arena);
  if (drivenSide && separated)
    resolveArenaObstacles(runtimeEnemy(runtime, drivenSide), runtime.arena);
}

function advanceCombatAttacks(
  runtime: StrategicCombatRuntime,
  dt: number,
  sides: readonly StrategicCombatSide[],
  drivenSide?: StrategicCombatSide
): void {
  updateCombatAsteroidThrows(runtime, dt, sides, drivenSide);
  for (const side of sides) {
    const ship = runtimeCombatant(runtime, side);
    if (ship.powerFault !== 'total') {
      maybeDropRuntimeMine(runtime, side, ship, runtimeEnemy(runtime, side), dt);
    }
  }
  const previousShields = [runtime.attacker.shieldHp, runtime.defender.shieldHp];
  const previousSubsystems = [
    runtime.attacker.subsystems.engine,
    runtime.attacker.subsystems.tractor,
    runtime.defender.subsystems.engine,
    runtime.defender.subsystems.tractor,
  ] as const;
  for (const side of sides) {
    advanceRuntimeWeapons(
      runtime,
      side,
      runtimeCombatant(runtime, side),
      runtimeEnemy(runtime, side),
      dt
    );
  }
  advanceRuntimeProjectiles(runtime, dt);
  advanceRuntimeMines(runtime, dt);
  reviewShieldBreakthroughs(runtime, previousShields);
  reviewSubsystemBreakthroughs(runtime, previousSubsystems);
  maybeAttemptBoarding(runtime, (side) => tryFireGrapple(runtime, side), sides);
}

function updateCombatOutcome(
  runtime: StrategicCombatRuntime,
  drivenSide?: StrategicCombatSide
): void {
  resolveRuntimeWinner(runtime);
  // A target's escape is authoritative only in the service that drives it.
  if (drivenSide && runtime.outcomeReason === 'escape' && runtime.winner === drivenSide) {
    runtime.winner = null;
    runtime.outcomeReason = null;
  }
  recordLatestCombatImpact(runtime);
  if (runtime.winner) recordCombatLog(runtime, 'system', 'result', runtime.lastEvent);
}

export function tickStrategicCombat(
  runtime: StrategicCombatRuntime,
  deltaSeconds: number,
  bystanders: readonly StrategicCombatBystander[],
  sharedArenaPhysics: boolean,
  drivenSide?: StrategicCombatSide,
  contacts?: FleetCombatContacts
): void {
  if (runtime.winner || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
  if (sharedArenaPhysics && (runtime.attacker.hullHp <= 0 || runtime.defender.hullHp <= 0)) {
    resolveRuntimeWinner(runtime);
    return;
  }
  const dt = Math.min(deltaSeconds, 0.08);
  const sides = drivenSide ? [drivenSide] : duelSides;
  runtime.elapsedSeconds += dt;
  for (const side of sides) {
    const ship = runtimeCombatant(runtime, side);
    if (advanceCombatPower(ship, dt)) {
      recordCombatLog(runtime, side, 'state', 'ENERGIEÜBERLAST · ' + ship.powerFault);
    }
  }
  if (!sharedArenaPhysics) advanceCombatAsteroids(runtime.arena, dt);
  for (const side of sides) {
    const ship = runtimeCombatant(runtime, side);
    ship.shieldImpacts = advanceShieldImpacts(ship.shieldImpacts, dt);
  }
  advanceRuntimeBeams(runtime, dt);
  for (const side of sides) {
    const ship = runtimeCombatant(runtime, side);
    if (ship.powerFault !== 'total')
      reviewAndExecute(runtime, ship, runtimeEnemy(runtime, side), side);
  }
  for (const side of sides) {
    moveCombatant(
      runtimeCombatant(runtime, side),
      runtimeEnemy(runtime, side),
      side,
      dt,
      runtime.arena,
      runtime.mines
    );
  }
  if (advanceRuntimeGrapple(runtime, dt, drivenSide, contacts)) return;
  advanceCombatContacts(runtime, bystanders, sides, drivenSide, contacts);
  advanceCombatAttacks(runtime, dt, sides, drivenSide);
  recordCombatMotion(runtime);
  updateCombatOutcome(runtime, drivenSide);
}
export function tryFireGrapple(
  runtime: StrategicCombatRuntime,
  side: 'attacker' | 'defender'
): boolean {
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
