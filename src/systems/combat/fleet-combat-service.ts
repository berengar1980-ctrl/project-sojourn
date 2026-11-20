import type {
  CombatPoint,
  CombatTactic,
  MutableCombatant,
  StrategicCombatArenaOptions,
  StrategicCombatantSetup,
  StrategicCombatantSnapshot,
} from './strategic-combat-types';
import {
  createCombatant,
  createRng,
  distance,
  hashSeed,
  snapshot,
} from './strategic-combat-geometry';
import { advanceFleetMotion } from './fleet-ship-motion';
import {
  createFleetWeaponPhysics,
  type FleetWeaponBeam,
  type FleetWeaponProjectile,
} from './fleet-weapon-physics';
import { isFleetHostile } from './fleet-faction-policy';
import {
  createFleetNativeSpecials,
  type FleetSpecialMine,
  type FleetSpecialThrow,
} from './fleet-native-specials';
import {
  activateFleetArrivals,
  reportFleetCombatToWorld,
  validateFleetScenario,
} from './fleet-combat-lifecycle';
import {
  createCombatEngagementManager,
  type EngagementSnapshot,
} from './combat-engagement-manager';

/** Fleet factions are identifiers, not hard-coded attacker/defender sides. */
export interface FleetCombatParticipant {
  readonly setup: StrategicCombatantSetup;
  readonly factionId: string;
  readonly position: CombatPoint;
  /** Preserve an existing campaign combatant as the authoritative mutable state.
   * No re-creation, re-equipping, HP reset, or cooldown reset is permitted.
   * Its position must match the supplied world position at handoff.
   */
  readonly liveCombatant?: MutableCombatant;
  readonly headingRadians?: number;
  /** An uninvolved worker may remain neutral and can later be engaged. */
  readonly targetId?: string | null;
  /** 0 = present from scene start; positive seconds = enter through a map boundary. */
  readonly spawnAtSeconds?: number;
  /** An external career entity remains the sole owner of movement. */
  readonly externalMovement?: (
    dt: number,
    nearby: readonly FleetCombatShipSnapshot[]
  ) => {
    readonly position: CombatPoint;
    readonly headingRadians: number;
    readonly targetId: string | null;
    /** The career-world owner may remove a ship when it departs the field. */
    readonly active?: boolean;
    /** Existing combat movement takes ownership while the career miner is threatened. */
    readonly combatMotionTargetId?: string;
    readonly combatTactic?: CombatTactic;
    readonly afterCombatMotion?: (position: CombatPoint, heading: number, speed: number) => void;
  };
}

export interface FleetCombatShipSnapshot {
  readonly factionId: string;
  readonly targetId: string | null;
  readonly ship: StrategicCombatantSnapshot;
}

export interface FleetCombatShotSnapshot {
  readonly sourceId: string;
  readonly targetId: string;
  readonly origin: CombatPoint;
  readonly destination: CombatPoint;
  readonly weaponId: string;
  readonly shieldDamage: number;
  readonly hullDamage: number;
}

export interface FleetCombatSnapshot {
  readonly elapsedSeconds: number;
  readonly ships: readonly FleetCombatShipSnapshot[];
  readonly shots: readonly FleetCombatShotSnapshot[];
  readonly projectiles: readonly FleetWeaponProjectile[];
  readonly beams: readonly FleetWeaponBeam[];
  readonly mines: readonly FleetSpecialMine[];
  readonly thrownAsteroids: readonly FleetSpecialThrow[];
  readonly pendingArrivals: readonly { id: string; atSeconds: number }[];
  readonly arrivedShipIds: readonly string[];
  readonly engagements: readonly EngagementSnapshot[];
  readonly arena: StrategicCombatArenaOptions;
}

/** Career world services are advanced exactly once per shared FleetCombat step.
 * The PvP test does not provide this hook and cannot replace campaign AI.
 * The caller must transfer exclusive tick ownership for the duration.
 */
export interface FleetCombatWorldOptions {
  readonly tickWorld?: (dt: number) => void;
  /** Resolve threats before the native worker ticks, preventing parallel mining. */
  readonly beforeWorldTick?: (ships: readonly FleetCombatShipSnapshot[]) => void;
  /** Reconcile combat damage to campaign NPCs after weapon processing. */
  readonly afterCombatTick?: (
    ships: readonly FleetCombatShipSnapshot[],
    shots: readonly FleetCombatShotSnapshot[]
  ) => void;
}

export interface FleetCombatService {
  tick(deltaSeconds: number): FleetCombatSnapshot;
  getSnapshot(): FleetCombatSnapshot;
  setTarget(shipId: string, targetId: string | null): void;
}

export interface FleetShip {
  readonly factionId: string;
  readonly combatant: MutableCombatant;
  targetId: string | null;
  readonly spawnAtSeconds: number;
  active: boolean;
  departed: boolean;
  combatMotionOwned: boolean;
  readonly externalMovement?: FleetCombatParticipant['externalMovement'];
}

function fleetView(
  fleet: readonly FleetShip[],
  shots: readonly FleetCombatShotSnapshot[],
  projectiles: readonly FleetWeaponProjectile[],
  beams: readonly FleetWeaponBeam[],
  mines: readonly FleetSpecialMine[],
  thrownAsteroids: readonly FleetSpecialThrow[],
  arrivedIds: readonly string[],
  engagements: readonly EngagementSnapshot[],
  elapsedSeconds: number,
  arena: StrategicCombatArenaOptions
): FleetCombatSnapshot {
  return {
    elapsedSeconds,
    ships: fleet
      .filter((entry) => entry.active)
      .map((entry) => ({
        factionId: entry.factionId,
        targetId: entry.targetId,
        ship: snapshot(entry.combatant),
      })),
    pendingArrivals: fleet
      .filter((entry) => !entry.active && !entry.departed)
      .map((entry) => ({
        id: entry.combatant.setup.id,
        atSeconds: entry.spawnAtSeconds,
      })),
    arrivedShipIds: arrivedIds.slice(),
    engagements,
    shots: shots.map((shot) => ({
      ...shot,
      origin: { ...shot.origin },
      destination: { ...shot.destination },
    })),
    projectiles,
    beams,
    mines,
    thrownAsteroids,
    arena,
  };
}

function initializeFleetParticipants(
  participants: readonly FleetCombatParticipant[],
  arena: StrategicCombatArenaOptions
): { byId: Map<string, FleetShip>; fleet: FleetShip[] } {
  const byId = new Map<string, FleetShip>();
  const fleet: FleetShip[] = [];
  for (const entry of participants) {
    const id = entry.setup.id;
    if (!id || byId.has(id)) throw new Error('Duplicate or empty FleetCombat ship ID: ' + id);
    if (!entry.factionId) throw new Error('Missing FleetCombat faction for ' + id);
    if (entry.liveCombatant) {
      if (entry.liveCombatant.setup.id !== id)
        throw new Error('FleetCombat live combatant ID mismatch: ' + id);
      if (entry.liveCombatant.setup !== entry.setup)
        throw new Error('FleetCombat live combatant loadout authority mismatch: ' + id);
      if (
        !Number.isFinite(entry.liveCombatant.position.x) ||
        !Number.isFinite(entry.liveCombatant.position.y) ||
        distance(entry.liveCombatant.position, entry.position) > 0.000001
      )
        throw new Error('FleetCombat live combatant position mismatch: ' + id);
    }
    if (
      entry.spawnAtSeconds !== undefined &&
      (!Number.isFinite(entry.spawnAtSeconds) || entry.spawnAtSeconds < 0)
    ) {
      throw new Error('Invalid FleetCombat arrival time for ' + id);
    }
    const combatant =
      entry.liveCombatant ??
      createCombatant(entry.setup, 'attacker', {
        ...arena,
        attackerPosition: entry.position,
        ...(entry.headingRadians !== undefined
          ? { attackerHeadingRadians: entry.headingRadians }
          : {}),
      });
    const ship: FleetShip = {
      factionId: entry.factionId,
      combatant,
      targetId: entry.targetId ?? null,
      spawnAtSeconds: entry.spawnAtSeconds ?? 0,
      active: (entry.spawnAtSeconds ?? 0) === 0,
      departed: false,
      combatMotionOwned: false,
      ...(entry.externalMovement ? { externalMovement: entry.externalMovement } : {}),
    };
    fleet.push(ship);
    byId.set(id, ship);
  }
  return { byId, fleet };
}

function createFleetTargeting(
  fleet: readonly FleetShip[],
  byId: ReadonlyMap<string, FleetShip>
): {
  validEnemy: (ship: FleetShip, target: FleetShip | undefined) => boolean;
  acquire: (ship: FleetShip) => FleetShip | null;
} {
  const validEnemy = (ship: FleetShip, target: FleetShip | undefined): boolean =>
    !!target &&
    target !== ship &&
    target.active &&
    target.combatant.hullHp > 0 &&
    isFleetHostile(ship.factionId, target.factionId);

  const acquire = (ship: FleetShip): FleetShip | null => {
    // A current target is sticky, preventing tick-by-tick oscillation.
    const current = ship.targetId ? byId.get(ship.targetId) : undefined;
    if (current && validEnemy(ship, current)) return current;
    // A neutral worker stays neutral until explicitly assigned a target.
    if (ship.targetId === null) return null;
    const candidates = fleet.filter((candidate) => validEnemy(ship, candidate));
    candidates.sort(
      (a, b) =>
        distance(ship.combatant.position, a.combatant.position) -
          distance(ship.combatant.position, b.combatant.position) ||
        a.combatant.setup.id.localeCompare(b.combatant.setup.id)
    );
    const selected = candidates[0] ?? null;
    if (selected) ship.targetId = selected.combatant.setup.id;
    // Preserve an assigned target that is scheduled to arrive later.
    else if (!current || current.active) ship.targetId = null;
    return selected;
  };

  return { validEnemy, acquire };
}

function setFleetTarget(
  shipId: string,
  targetId: string | null,
  byId: ReadonlyMap<string, FleetShip>,
  validEnemy: (ship: FleetShip, target: FleetShip | undefined) => boolean
): void {
  const ship = byId.get(shipId);
  if (!ship) throw new Error('Unknown FleetCombat ship: ' + shipId);
  if (!ship.active) throw new Error('FleetCombat ship has not arrived: ' + shipId);
  if (targetId !== null && !validEnemy(ship, byId.get(targetId))) {
    throw new Error('Invalid FleetCombat target: ' + targetId);
  }
  ship.targetId = targetId;
}

interface FleetStepContext {
  readonly fleet: readonly FleetShip[];
  readonly byId: ReadonlyMap<string, FleetShip>;
  readonly arena: StrategicCombatArenaOptions;
  readonly world: FleetCombatWorldOptions;
  readonly engagementManager: ReturnType<typeof createCombatEngagementManager>;
  readonly nativeSpecials: ReturnType<typeof createFleetNativeSpecials>;
  readonly weaponPhysics: ReturnType<typeof createFleetWeaponPhysics>;
  readonly acquire: (ship: FleetShip) => FleetShip | null;
}
function advanceFleetStep(
  context: FleetStepContext,
  dt: number,
  now: number
): { shots: FleetCombatShotSnapshot[]; arrivedIds: string[] } {
  const { fleet, byId, arena, world, engagementManager, nativeSpecials, weaponPhysics, acquire } =
    context;
  // Only ships present at the START of this interval may move/fire in it.
  const present = fleet.filter((ship) => ship.active);
  const impactHits: FleetCombatShotSnapshot[] = [];
  advanceFleetMotion(
    present,
    acquire,
    arena,
    dt,
    world.tickWorld,
    world.beforeWorldTick,
    (first, second) => impactHits.push(...nativeSpecials.ram(first, second, now))
  );
  for (const ship of present) {
    if (ship.departed) engagementManager.disengage(ship.combatant.setup.id);
  }
  const remainingShips = present.filter((ship) => ship.active);
  for (const ship of remainingShips) {
    if (!ship.targetId || ship.combatant.hullHp <= 0) continue;
    const enemy = byId.get(ship.targetId);
    if (
      enemy?.active &&
      enemy.combatant.hullHp > 0 &&
      isFleetHostile(ship.factionId, enemy.factionId)
    ) {
      engagementManager.engage(ship.combatant.setup.id, enemy.combatant.setup.id);
    }
  }
  const specialHits = nativeSpecials.tick(
    dt,
    now,
    remainingShips.map((ship) => ship.combatant),
    (actor) => {
      const ship = byId.get(actor.setup.id);
      return ship ? (acquire(ship)?.combatant ?? null) : null;
    }
  );
  const weaponHits = weaponPhysics
    .tick(
      dt,
      now,
      remainingShips.map((ship) => ship.combatant),
      (actor) => {
        const ship = byId.get(actor.setup.id);
        return ship ? (acquire(ship)?.combatant ?? null) : null;
      }
    )
    .map((hit) => ({ ...hit }));
  const shots: FleetCombatShotSnapshot[] = [...impactHits, ...specialHits, ...weaponHits];
  for (const ship of remainingShips) {
    if (ship.targetId) acquire(ship);
  }
  reportFleetCombatToWorld(world, remainingShips, shots);
  for (const ship of remainingShips) {
    if (ship.combatant.hullHp <= 0) {
      engagementManager.disengage(ship.combatant.setup.id);
    }
  }
  return { shots, arrivedIds: activateFleetArrivals(fleet, now) };
}

/**
 * First independently simulated N-ship combat kernel.
 * Reuses 1vs1's ship construction, flight/obstacle/contact and layered
 * damage rules and native fire control/projectile flight. Does not instantiate
 * overlapping StrategicCombatService duels or change its runtime.
 * Mines, rams and tractor throws remain separate integration work.
 */
export function createFleetCombatService(
  participants: readonly FleetCombatParticipant[],
  arena: StrategicCombatArenaOptions,
  world: FleetCombatWorldOptions = {}
): FleetCombatService {
  validateFleetScenario(participants, arena);
  const { byId, fleet } = initializeFleetParticipants(participants, arena);
  let elapsedSeconds = 0;
  let shots: FleetCombatShotSnapshot[] = [];
  let arrivedIds: string[] = [];
  const engagementManager = createCombatEngagementManager();
  const nativeSpecials = createFleetNativeSpecials(arena);
  const weaponPhysics = createFleetWeaponPhysics(
    arena,
    createRng(hashSeed(participants.map((entry) => entry.setup.id).join('|')))
  );

  const { validEnemy, acquire } = createFleetTargeting(fleet, byId);

  const view = (): FleetCombatSnapshot =>
    fleetView(
      fleet,
      shots,
      weaponPhysics.projectiles(),
      weaponPhysics.beams(),
      nativeSpecials.mines(),
      nativeSpecials.throws(),
      arrivedIds,
      engagementManager.engagements(),
      elapsedSeconds,
      arena
    );

  const step = (dt: number): void => {
    const result = advanceFleetStep(
      { fleet, byId, arena, world, engagementManager, nativeSpecials, weaponPhysics, acquire },
      dt, elapsedSeconds + dt
    );
    shots = result.shots;
    arrivedIds = result.arrivedIds;
    elapsedSeconds += dt;
  };

  return {
    getSnapshot: view,
    tick(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return view();
      let remaining = Math.min(deltaSeconds, 0.5);
      const arrivals: string[] = [];
      while (remaining > 0.000001) {
        const nextArrival = fleet.reduce(
          (earliest, ship) =>
            !ship.active && !ship.departed && ship.spawnAtSeconds > elapsedSeconds + 1e-8
              ? Math.min(earliest, ship.spawnAtSeconds - elapsedSeconds)
              : earliest,
          Infinity
        );
        const dt = Math.min(remaining, 0.08, nextArrival);
        if (dt <= 0) break;
        step(dt);
        arrivals.push(...arrivedIds);
        remaining -= dt;
      }
      arrivedIds = arrivals;
      return view();
    },
    setTarget(shipId, targetId) {
      setFleetTarget(shipId, targetId, byId, validEnemy);
    },
  };
}
