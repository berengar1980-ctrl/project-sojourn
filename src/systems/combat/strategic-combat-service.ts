import { retargetNativeFleetSurvivor, redirectNativeFleetTarget } from './native-fleet-retarget';
import { runtimeSnapshot } from './strategic-combat-runtime-snapshot';
import {
  captureCareerStrategicCombat,
  stageCareerStrategicCombat,
  type CareerStrategicCombatCheckpoint,
} from './career-strategic-combat-checkpoint';
import type { StrategicCombatBystander } from './strategic-combat-bystander-types';
import type {
  CombatTactic,
  StrategicCombatArenaOptions,
  StrategicCombatRuntime,
  StrategicCombatantSetup,
  MutableCombatant,
  StrategicCombatSide,
} from './strategic-combat-types';
import type { StrategicCombatService } from './strategic-combat-service-types';
import { createCombatant, createRng, hashSeed } from './strategic-combat-geometry';
import { runtimeCombatant } from './strategic-combat-runtime';
import { buildCombatArena } from './strategic-combat-arena';
import { recordCombatLog } from './strategic-combat-telemetry';
import { tickStrategicCombat, tryFireGrapple } from './strategic-combat-step';
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
export type { StrategicCombatService } from './strategic-combat-service-types';
export { createCombatShieldGeometry } from './strategic-combat-geometry';
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

function resumeBoardedCombat(runtime: StrategicCombatRuntime): boolean {
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
}

function setCombatTactic(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  tactic: CombatTactic
): void {
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
  let fleetDrivenSide: StrategicCombatSide | undefined = externalDefender ? 'attacker' : undefined;
  const advance: StrategicCombatService['advance'] = (dt, claimRamImpact) =>
    tickStrategicCombat(
      runtime,
      dt,
      bystanders,
      sharedArenaPhysics,
      fleetDrivenSide,
      claimRamImpact
    );
  const getStatus = () => ({
    winner: runtime.winner,
    outcomeReason: runtime.outcomeReason ?? null,
    boardingInitiator: runtime.boardingInitiator,
    attackerId: runtime.attacker.setup.id,
    defenderId: runtime.defender.setup.id,
  });
  return {
    exportCareerState: () => captureCareerStrategicCombat(runtime),
    getParallelActor: (side) => runtimeCombatant(runtime, side),
    retargetParallelSurvivor(side, opponent, orphaned = false) {
      if (!sharedArenaPhysics) return false;
      const continued = retargetNativeFleetSurvivor(runtime, side, opponent, orphaned);
      if (continued) fleetDrivenSide = side;
      return continued;
    },
    redirectParallelSupport(opponent) {
      if (!sharedArenaPhysics || !fleetDrivenSide) return false;
      return redirectNativeFleetTarget(runtime, fleetDrivenSide, opponent);
    },
    getSnapshot: () => runtimeSnapshot(runtime),
    getCombatLog: () => runtime.combatLog.map((entry) => ({ ...entry })),
    fireGrapple: (side) =>
      (!fleetDrivenSide || side === fleetDrivenSide) && tryFireGrapple(runtime, side),
    resumeAfterBoarding: () => resumeBoardedCombat(runtime),
    setTactic: (side, tactic) => setCombatTactic(runtime, side, tactic),
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
    getArena: () => runtime.arena,
    attachToFleet: (obstacles, asteroids) => {
      sharedArenaPhysics = true;
      Object.assign(runtime.arena, { obstacles, asteroids });
    },
    getStatus,
    advance,
    tick: (deltaSeconds) => {
      advance(deltaSeconds);
      return runtimeSnapshot(runtime);
    },
  };
}
