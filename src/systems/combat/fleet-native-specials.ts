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
      // The 1vs1 functions decrement cooldowns internally. In an N-ship
      // engagement, do that once per actual ship, not once per opponent.
      for (const ship of ships) {
        ship.mineCooldown = Math.max(0, ship.mineCooldown - dt);
        ship.tractorThrowCooldown = Math.max(0, (ship.tractorThrowCooldown ?? 0) - dt);
      }
      for (const source of ships) {
        if (source.hullHp <= 0) continue;
        const target = targetFor(source);
        if (!target || target.hullHp <= 0) continue;
        const runtime = pairFor(source, target).runtime;
        runtime.elapsedSeconds = now;
        const side = sideFor(runtime, source);
        if (source.powerFault !== 'total') {
          maybeDropRuntimeMine(runtime, side, source, target, 0);
          maybeLaunchTractorAsteroid(runtime, side, source, target);
        }
      }
      for (const pair of pairs.values()) {
        const runtime = pair.runtime;
        if (!active.has(runtime.attacker.setup.id) || !active.has(runtime.defender.setup.id))
          continue;
        runtime.elapsedSeconds = now;
        captureSpecialImpact(runtime, () => advanceRuntimeMines(runtime, dt), hits);
        // Native throw physics also decrements the two ship cooldowns;
        // restore the already-once-updated values after its physical step.
        const aCooldown = runtime.attacker.tractorThrowCooldown;
        const dCooldown = runtime.defender.tractorThrowCooldown;
        captureSpecialImpact(runtime, () => advanceThrownAsteroids(runtime, dt), hits);
        runtime.attacker.tractorThrowCooldown = aCooldown;
        runtime.defender.tractorThrowCooldown = dCooldown;
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
