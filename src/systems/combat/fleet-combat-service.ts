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
import {
  moveCombatant,
  resolveCombatantCollision,
  resolveArenaObstacles,
} from './strategic-combat-movement';
import { advanceShieldImpacts } from '../shields/shield-service';
import {
  createFleetWeaponPhysics,
  type FleetWeaponBeam,
  type FleetWeaponProjectile,
} from './fleet-weapon-physics';
import { isFleetHostile } from './fleet-faction-policy';
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

interface FleetShip {
  readonly factionId: string;
  readonly combatant: MutableCombatant;
  targetId: string | null;
  readonly spawnAtSeconds: number;
  active: boolean;
  departed: boolean;
  combatMotionOwned: boolean;
  readonly externalMovement?: FleetCombatParticipant['externalMovement'];
}

function advanceExternalFleetMotion(
  ship: FleetShip,
  fleet: readonly FleetShip[],
  nearby: readonly FleetCombatShipSnapshot[],
  arena: StrategicCombatArenaOptions,
  dt: number
): void {
  const actor = ship.combatant;
  const next = ship.externalMovement?.(dt, nearby);
  if (!next) return;
  if (next.active === false) {
    ship.active = false;
    ship.departed = true;
    ship.targetId = null;
    return;
  }
  if (next.combatMotionTargetId) {
    const enemy = fleet.find(
      (candidate) => candidate.combatant.setup.id === next.combatMotionTargetId
    );
    if (enemy?.active && enemy.combatant.hullHp > 0) {
      actor.tactic = next.combatTactic ?? actor.tactic;
      moveCombatant(actor, enemy.combatant, 'attacker', dt, arena, []);
      ship.combatMotionOwned = true;
      ship.targetId = next.targetId;
      next.afterCombatMotion?.(actor.position, actor.headingRadians, actor.speed);
      return;
    }
  }
  const previous = { ...actor.position };
  actor.position = { ...next.position };
  actor.velocity = {
    x: (next.position.x - previous.x) / dt,
    y: (next.position.y - previous.y) / dt,
  };
  actor.speed = distance(previous, next.position) / dt;
  actor.headingRadians = next.headingRadians;
  ship.targetId = next.targetId;
}

function advanceFleetMotion(
  fleet: readonly FleetShip[],
  acquire: (ship: FleetShip) => FleetShip | null,
  arena: StrategicCombatArenaOptions,
  dt: number,
  worldTick?: FleetCombatWorldOptions['tickWorld'],
  beforeWorldTick?: FleetCombatWorldOptions['beforeWorldTick']
): void {
  // Threat decisions precede the field tick: a threatened miner cannot mine.
  beforeWorldTick?.(
    fleet.map((entry) => ({
      factionId: entry.factionId,
      targetId: entry.targetId,
      ship: snapshot(entry.combatant),
    }))
  );
  worldTick?.(dt);
  const nearby = fleet.map((ship) => ({
    factionId: ship.factionId,
    targetId: ship.targetId,
    ship: snapshot(ship.combatant),
  }));
  for (const ship of fleet) {
    ship.combatMotionOwned = false;
    const actor = ship.combatant;
    actor.shieldImpacts = advanceShieldImpacts(actor.shieldImpacts, dt);
    if (actor.hullHp <= 0) continue;
    if (ship.externalMovement) {
      advanceExternalFleetMotion(ship, fleet, nearby, arena, dt);
      continue;
    }
    const target = acquire(ship);
    if (target) {
      moveCombatant(actor, target.combatant, 'attacker', dt, arena, []);
    } else {
      actor.position.x = Math.max(
        0,
        Math.min(arena.width, actor.position.x + actor.velocity.x * dt)
      );
      actor.position.y = Math.max(
        0,
        Math.min(arena.height, actor.position.y + actor.velocity.y * dt)
      );
      resolveArenaObstacles(actor, arena);
    }
  }
  for (let i = 0; i < fleet.length; i += 1) {
    for (let j = i + 1; j < fleet.length; j += 1) {
      if (!fleet[i]!.active || !fleet[j]!.active) continue;
      // The campaign drone already resolves its own physical ship contacts.
      if (
        (fleet[i]!.externalMovement && !fleet[i]!.combatMotionOwned) ||
        (fleet[j]!.externalMovement && !fleet[j]!.combatMotionOwned)
      )
        continue;
      const a = fleet[i]!.combatant;
      const b = fleet[j]!.combatant;
      if (a.hullHp > 0 && b.hullHp > 0) resolveCombatantCollision(a, b);
    }
  }
}

function fleetView(
  fleet: readonly FleetShip[],
  shots: readonly FleetCombatShotSnapshot[],
  projectiles: readonly FleetWeaponProjectile[],
  beams: readonly FleetWeaponBeam[],
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
  const weaponPhysics = createFleetWeaponPhysics(
    arena,
    createRng(hashSeed(participants.map((entry) => entry.setup.id).join('|')))
  );

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

  const view = (): FleetCombatSnapshot =>
    fleetView(
      fleet,
      shots,
      weaponPhysics.projectiles(),
      weaponPhysics.beams(),
      arrivedIds,
      engagementManager.engagements(),
      elapsedSeconds,
      arena
    );

  const step = (dt: number): void => {
    // Only ships present at the START of this interval may move/fire in it.
    const present = fleet.filter((ship) => ship.active);
    advanceFleetMotion(present, acquire, arena, dt, world.tickWorld, world.beforeWorldTick);
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
    shots = weaponPhysics
      .tick(
        dt,
        elapsedSeconds + dt,
        remainingShips.map((ship) => ship.combatant),
        (actor) => {
          const ship = byId.get(actor.setup.id);
          return ship ? (acquire(ship)?.combatant ?? null) : null;
        }
      )
      .map((hit) => ({ ...hit }));
    for (const ship of remainingShips) {
      if (ship.targetId) acquire(ship);
    }
    reportFleetCombatToWorld(world, remainingShips, shots);
    for (const ship of remainingShips) {
      if (ship.combatant.hullHp <= 0) {
        engagementManager.disengage(ship.combatant.setup.id);
      }
    }
    elapsedSeconds += dt;
    arrivedIds = activateFleetArrivals(fleet, elapsedSeconds);
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
      const ship = byId.get(shipId);
      if (!ship) throw new Error('Unknown FleetCombat ship: ' + shipId);
      if (!ship.active) throw new Error('FleetCombat ship has not arrived: ' + shipId);
      if (targetId !== null && !validEnemy(ship, byId.get(targetId))) {
        throw new Error('Invalid FleetCombat target: ' + targetId);
      }
      ship.targetId = targetId;
    },
  };
}
