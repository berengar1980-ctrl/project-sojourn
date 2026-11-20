import type {
  MutableCombatant,
  MutableMine,
  MutableThrownAsteroid,
  StrategicCombatArenaOptions,
  StrategicCombatRuntime,
  StrategicCombatSide,
} from './strategic-combat-types';
import { maybeDropRuntimeMine, advanceRuntimeMines } from './strategic-combat-mines';
import { applyCombatRamImpact } from './combat-ram-impact';
import {
  maybeLaunchTractorAsteroid,
  advanceThrownAsteroids,
} from './combat-tractor-asteroid-throw';
import type { FleetWeaponHit } from './fleet-weapon-physics';

interface FleetSpecialPair {
  readonly runtime: StrategicCombatRuntime;
}
export interface FleetSpecialMine {
  readonly id: number;
  readonly ownerId: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly kind: MutableMine['definition']['kind'];
  readonly armed: boolean;
  readonly radius: number;
}
export interface FleetSpecialThrow {
  readonly ownerId: string;
  readonly asteroidId: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly phase: MutableThrownAsteroid['phase'];
}

/** 1vs1 physics expects a two-sided event envelope, not an independent duel.
 * Both pointers refer to the SAME authoritative mutable career ships.
 * No navigation, weapons, NPCs or collision algorithms are cloned.
 */
function createPairRuntime(
  first: MutableCombatant,
  second: MutableCombatant,
  arena: StrategicCombatArenaOptions
): StrategicCombatRuntime {
  return {
    attacker: first,
    defender: second,
    arena,
    elapsedSeconds: 0,
    mines: [],
    thrownAsteroids: [],
    beams: [],
    projectiles: [],
    combatLog: [],
    recentImpacts: [],
    mineSerial: 0,
    beamSerial: 0,
    impactSerial: 0,
    lastImpact: null,
    lastEvent: '',
  } as unknown as StrategicCombatRuntime;
}
function pairKey(first: MutableCombatant, second: MutableCombatant): string {
  return [first.setup.id, second.setup.id].sort().join('\u0000');
}
function sideFor(runtime: StrategicCombatRuntime, ship: MutableCombatant): StrategicCombatSide {
  return runtime.attacker === ship ? 'attacker' : 'defender';
}
function recordDamage(
  source: MutableCombatant,
  target: MutableCombatant,
  previousShield: number,
  previousHull: number,
  kind: string,
  output: FleetWeaponHit[]
): void {
  const shieldDamage = Math.max(0, previousShield - target.shieldHp);
  const hullDamage = Math.max(0, previousHull - target.hullHp);
  if (shieldDamage + hullDamage <= 0) return;
  output.push({
    sourceId: source.setup.id,
    targetId: target.setup.id,
    origin: { ...source.position },
    destination: { ...target.position },
    weaponId: kind,
    shieldDamage,
    hullDamage,
  });
}
function captureSpecialImpact(
  runtime: StrategicCombatRuntime,
  action: () => void,
  output: FleetWeaponHit[]
): void {
  const { attacker, defender } = runtime;
  const before = {
    aShield: attacker.shieldHp,
    aHull: attacker.hullHp,
    dShield: defender.shieldHp,
    dHull: defender.hullHp,
  };
  const serial = runtime.impactSerial;
  action();
  // A single original mine/throw impact records the struck side. Do not
  // invent a contributor when there was no physical hit or damage.
  if (runtime.impactSerial === serial || !runtime.lastImpact) return;
  const struck = runtime.lastImpact.target === 'attacker' ? attacker : defender;
  const source = struck === attacker ? defender : attacker;
  recordDamage(
    source,
    struck,
    struck === attacker ? before.aShield : before.dShield,
    struck === attacker ? before.aHull : before.dHull,
    'native-special-impact',
    output
  );
}
/** Resolve each native mine separately, because the duel runtime reports only its
 * most recent impact. FleetCombat needs an individual contribution for every
 * simultaneous detonation; the original native damage calculation is reused.
 */
function advanceFleetMineImpacts(
  runtime: StrategicCombatRuntime,
  dt: number,
  hits: FleetWeaponHit[]
): void {
  const queued = runtime.mines.splice(0);
  const survivors: MutableMine[] = [];
  for (const mine of queued) {
    runtime.mines.push(mine);
    captureSpecialImpact(runtime, () => advanceRuntimeMines(runtime, dt), hits);
    survivors.push(...runtime.mines.splice(0));
  }
  runtime.mines.push(...survivors);
}

function advanceFleetThrowImpacts(
  runtime: StrategicCombatRuntime,
  dt: number,
  hits: FleetWeaponHit[]
): void {
  const queued = runtime.thrownAsteroids.splice(0);
  const survivors: MutableThrownAsteroid[] = [];
  // The native throw routine also decrements tractor cooldown for both ships.
  // The FleetCombat owner has already advanced each ship exactly once.
  const aCooldown = runtime.attacker.tractorThrowCooldown ?? 0;
  const dCooldown = runtime.defender.tractorThrowCooldown ?? 0;
  for (const rock of queued) {
    runtime.thrownAsteroids.push(rock);
    captureSpecialImpact(runtime, () => advanceThrownAsteroids(runtime, dt), hits);
    survivors.push(...runtime.thrownAsteroids.splice(0));
    runtime.attacker.tractorThrowCooldown = aCooldown;
    runtime.defender.tractorThrowCooldown = dCooldown;
  }
  runtime.thrownAsteroids.push(...survivors);
}

/** A deployed mine or in-flight rock remains owned by its original pairing.
 * Its source may retreat or depart, but the native contact calculation
 * continues against the originally designated target while that target
 * remains in the field. If that target leaves, discard stale target-locked
 * objects instead of freezing them or hitting an off-map ghost.
 */
function advanceExistingFleetSpecials(
  runtime: StrategicCombatRuntime,
  activeIds: ReadonlySet<string>,
  now: number,
  dt: number,
  hits: FleetWeaponHit[]
): boolean {
  const attackerActive = activeIds.has(runtime.attacker.setup.id);
  const defenderActive = activeIds.has(runtime.defender.setup.id);
  if (!attackerActive && !defenderActive) return false;
  runtime.elapsedSeconds = now;
  runtime.mines.splice(
    0,
    runtime.mines.length,
    ...runtime.mines.filter((mine) =>
      activeIds.has((mine.owner === 'attacker' ? runtime.defender : runtime.attacker).setup.id)
    )
  );
  runtime.thrownAsteroids.splice(
    0,
    runtime.thrownAsteroids.length,
    ...runtime.thrownAsteroids.filter((rock) =>
      activeIds.has((rock.owner === 'attacker' ? runtime.defender : runtime.attacker).setup.id)
    )
  );
  // The original native routines still determine arming, pursuit, travel,
  // impact and damage. The wrapper only manages multi-ship lifetime.
  if (runtime.mines.length) advanceFleetMineImpacts(runtime, dt, hits);
  if (runtime.thrownAsteroids.length) advanceFleetThrowImpacts(runtime, dt, hits);
  return true;
}

function performFleetRam(runtime: StrategicCombatRuntime, now: number): FleetWeaponHit[] {
  runtime.elapsedSeconds = now;
  const previous = {
    aShield: runtime.attacker.shieldHp,
    aHull: runtime.attacker.hullHp,
    dShield: runtime.defender.shieldHp,
    dHull: runtime.defender.hullHp,
  };
  applyCombatRamImpact(runtime);
  const impacts: FleetWeaponHit[] = [];
  recordDamage(
    runtime.defender,
    runtime.attacker,
    previous.aShield,
    previous.aHull,
    'native-ram',
    impacts
  );
  recordDamage(
    runtime.attacker,
    runtime.defender,
    previous.dShield,
    previous.dHull,
    'native-ram',
    impacts
  );
  return impacts;
}

function selectSpecialTargets(
  ships: readonly MutableCombatant[],
  targetFor: (ship: MutableCombatant) => MutableCombatant | null
): Map<MutableCombatant, MutableCombatant> {
  const selected = new Map<MutableCombatant, MutableCombatant>();
  for (const source of ships) {
    if (source.hullHp <= 0) continue;
    const target = targetFor(source);
    if (target && target.hullHp > 0) selected.set(source, target);
  }
  return selected;
}

/** Mutable pair state persists throughout the encounter, so an in-flight
 * tractor rock or armed mine survives target switches and successive ticks.
 */
export function createFleetNativeSpecials(arena: StrategicCombatArenaOptions): {
  ram(first: MutableCombatant, second: MutableCombatant, now: number): FleetWeaponHit[];
  tick(
    dt: number,
    now: number,
    ships: readonly MutableCombatant[],
    targetFor: (ship: MutableCombatant) => MutableCombatant | null
  ): FleetWeaponHit[];
  mines(): readonly FleetSpecialMine[];
  throws(): readonly FleetSpecialThrow[];
} {
  const pairs = new Map<string, FleetSpecialPair>();
  const pairFor = (first: MutableCombatant, second: MutableCombatant): FleetSpecialPair => {
    const key = pairKey(first, second);
    let pair = pairs.get(key);
    if (!pair) {
      pair = { runtime: createPairRuntime(first, second, arena) };
      pairs.set(key, pair);
    }
    return pair;
  };
  return {
    ram(first, second, now) {
      return performFleetRam(pairFor(first, second).runtime, now);
    },
    tick(dt, now, ships, targetFor) {
      const hits: FleetWeaponHit[] = [];
      const active = new Set(ships.map((ship) => ship.setup.id));
      const selected = selectSpecialTargets(ships, targetFor);
      const engaged = new Set<string>();
      for (const [source, target] of selected) {
        engaged.add(source.setup.id);
        engaged.add(target.setup.id);
      }
      for (const { runtime } of pairs.values()) {
        // Historic pair records (including old ram contacts) do not create an
        // indefinite combat engagement when no live ammunition remains.
        if (!runtime.mines.length && !runtime.thrownAsteroids.length) continue;
        for (const ship of [runtime.attacker, runtime.defender]) {
          if (active.has(ship.setup.id)) engaged.add(ship.setup.id);
        }
      }
      // A neutral career worker retains its authoritative cooldowns. Combat
      // participants advance once, even if targeted by several enemies.
      for (const ship of ships) {
        if (!engaged.has(ship.setup.id)) continue;
        ship.mineCooldown = Math.max(0, ship.mineCooldown - dt);
        ship.tractorThrowCooldown = Math.max(0, (ship.tractorThrowCooldown ?? 0) - dt);
      }
      for (const [source, target] of selected) {
        const runtime = pairFor(source, target).runtime;
        runtime.elapsedSeconds = now;
        const side = sideFor(runtime, source);
        if (source.powerFault !== 'total') {
          maybeDropRuntimeMine(runtime, side, source, target, 0);
          maybeLaunchTractorAsteroid(runtime, side, source, target);
        }
      }
      for (const [key, pair] of pairs) {
        if (!advanceExistingFleetSpecials(pair.runtime, active, now, dt, hits)) {
          pairs.delete(key);
        }
      }
      return hits;
    },
    mines: () =>
      [...pairs.values()].flatMap(({ runtime }) =>
        runtime.mines.map((mine) => ({
          id: mine.id,
          ownerId: (mine.owner === 'attacker' ? runtime.attacker : runtime.defender).setup.id,
          position: { ...mine.position },
          kind: mine.definition.kind,
          armed: mine.armedSeconds <= 0,
          radius: mine.definition.triggerRadiusMeters,
        }))
      ),
    throws: () =>
      [...pairs.values()].flatMap(({ runtime }) =>
        runtime.thrownAsteroids.map((rock) => ({
          ownerId: (rock.owner === 'attacker' ? runtime.attacker : runtime.defender).setup.id,
          asteroidId: rock.asteroidId,
          position: { ...rock.position },
          phase: rock.phase,
        }))
      ),
  };
}
