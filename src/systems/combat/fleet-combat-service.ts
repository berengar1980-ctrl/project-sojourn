import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
  StrategicCombatantSetup,
  StrategicCombatantSnapshot,
} from './strategic-combat-types';
import { createCombatant, distance, snapshot } from './strategic-combat-geometry';
import {
  moveCombatant,
  resolveCombatantCollision,
  resolveArenaObstacles,
} from './strategic-combat-movement';
import { advanceShieldImpacts } from '../shields/shield-service';
import { resolveShipWeaponHit } from './ship-weapon-service';
import { isFleetHostile } from './fleet-faction-policy';
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
  readonly pendingArrivals: readonly { id: string; atSeconds: number }[];
  readonly arrivedShipIds: readonly string[];
  readonly engagements: readonly EngagementSnapshot[];
  readonly arena: StrategicCombatArenaOptions;
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
  readonly externalMovement?: FleetCombatParticipant['externalMovement'];
}

function advanceFleetMotion(
  fleet: readonly FleetShip[],
  acquire: (ship: FleetShip) => FleetShip | null,
  arena: StrategicCombatArenaOptions,
  dt: number
): void {
  const nearby = fleet.map((ship) => ({
    factionId: ship.factionId,
    targetId: ship.targetId,
    ship: snapshot(ship.combatant),
  }));
  for (const ship of fleet) {
    const actor = ship.combatant;
    actor.shieldImpacts = advanceShieldImpacts(actor.shieldImpacts, dt);
    if (actor.hullHp <= 0) continue;
    if (ship.externalMovement) {
      const next = ship.externalMovement(dt, nearby);
      const previous = { ...actor.position };
      actor.position = { ...next.position };
      actor.velocity = {
        x: (next.position.x - previous.x) / dt,
        y: (next.position.y - previous.y) / dt,
      };
      actor.speed = distance(previous, next.position) / dt;
      actor.headingRadians = next.headingRadians;
      ship.targetId = next.targetId;
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
      // The campaign drone already resolves its own physical ship contacts.
      if (fleet[i]!.externalMovement || fleet[j]!.externalMovement) continue;
      const a = fleet[i]!.combatant;
      const b = fleet[j]!.combatant;
      if (a.hullHp > 0 && b.hullHp > 0) resolveCombatantCollision(a, b);
    }
  }
}

function fleetDirectShot(
  actor: MutableCombatant,
  victim: MutableCombatant,
  index: number
): FleetCombatShotSnapshot | null {
  const weapon = actor.setup.weapons[index];
  const profile = weapon?.weapon;
  if (!weapon || !profile || actor.cooldowns[index]! > 0) return null;
  if (distance(actor.position, victim.position) > profile.rangeMeters) return null;
  const toTarget = Math.atan2(
    victim.position.y - actor.position.y,
    victim.position.x - actor.position.x
  );
  const angle = Math.atan2(
    Math.sin(toTarget - actor.headingRadians),
    Math.cos(toTarget - actor.headingRadians)
  );
  const mount = actor.setup.weaponMounts?.find((entry) => entry.slotIndex === index);
  const facing = mount?.facing ?? 'forward';
  const expected = facing === 'port' ? -Math.PI / 2 : facing === 'starboard' ? Math.PI / 2 : 0;
  const offset = Math.atan2(Math.sin(angle - expected), Math.cos(angle - expected));
  const arc =
    profile.mount === 'turret' || profile.mount === 'guided'
      ? Math.PI * 2
      : ((mount?.arcDegrees ?? profile.arcDegrees ?? 65) * Math.PI) / 180;
  if (Math.abs(offset) > arc / 2) return null;
  // Direct-hit prototype only; accurate projectiles, misses and ammunition follow.
  const hit = resolveShipWeaponHit(weapon, victim);
  victim.shieldHp = hit.shieldRemaining;
  victim.hullHp = hit.hullRemaining;
  actor.cooldowns[index] = Math.max(
    0.15,
    profile.cooldownSeconds * actor.setup.cycleTimeMultiplier
  );
  return {
    sourceId: actor.setup.id,
    targetId: victim.setup.id,
    origin: { ...actor.position },
    destination: { ...victim.position },
    weaponId: weapon.id,
    shieldDamage: hit.shieldDamage,
    hullDamage: hit.hullDamage,
  };
}

function advanceFleetFire(
  fleet: readonly FleetShip[],
  acquire: (ship: FleetShip) => FleetShip | null,
  dt: number
): FleetCombatShotSnapshot[] {
  const shots: FleetCombatShotSnapshot[] = [];
  for (const ship of fleet) {
    const actor = ship.combatant;
    if (actor.hullHp <= 0) continue;
    const target = acquire(ship);
    for (let index = 0; index < actor.cooldowns.length; index += 1) {
      actor.cooldowns[index] = Math.max(0, actor.cooldowns[index]! - dt);
    }
    if (!target) continue;
    for (let index = 0; index < actor.setup.weapons.length; index += 1) {
      const shot = fleetDirectShot(actor, target.combatant, index);
      if (shot) shots.push(shot);
      if (target.combatant.hullHp <= 0) break;
    }
  }
  for (const ship of fleet) {
    if (ship.targetId) acquire(ship);
  }
  return shots;
}

function fleetView(
  fleet: readonly FleetShip[],
  shots: readonly FleetCombatShotSnapshot[],
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
      .filter((entry) => !entry.active)
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
    arena,
  };
}

function validateFleetScenario(
  participants: readonly FleetCombatParticipant[],
  arena: StrategicCombatArenaOptions
): void {
  if (participants.length < 3) throw new Error('FleetCombat needs at least three ships');
  if (!(arena.width > 0 && arena.height > 0)) throw new Error('Invalid FleetCombat arena');
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
 * damage rules. Does not instantiate overlapping StrategicCombatService
 * duels or change its runtime. Unsupported weapons effects, mines, rams
 * and tractor throws are not advertised as implemented here.
 */
export function createFleetCombatService(
  participants: readonly FleetCombatParticipant[],
  arena: StrategicCombatArenaOptions
): FleetCombatService {
  validateFleetScenario(participants, arena);
  const { byId, fleet } = initializeFleetParticipants(participants, arena);
  let elapsedSeconds = 0;
  let shots: FleetCombatShotSnapshot[] = [];
  let arrivedIds: string[] = [];
  const engagementManager = createCombatEngagementManager();

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
    fleetView(fleet, shots, arrivedIds, engagementManager.engagements(), elapsedSeconds, arena);

  const step = (dt: number): void => {
    // Only ships present at the START of this interval may move/fire in it.
    const present = fleet.filter((ship) => ship.active);
    advanceFleetMotion(present, acquire, arena, dt);
    for (const ship of present) {
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
    shots = advanceFleetFire(present, acquire, dt);
    for (const ship of present) {
      if (ship.combatant.hullHp <= 0) {
        engagementManager.disengage(ship.combatant.setup.id);
      }
    }
    elapsedSeconds += dt;
    arrivedIds = [];
    for (const ship of fleet) {
      if (!ship.active && ship.spawnAtSeconds <= elapsedSeconds + 1e-8) {
        ship.active = true;
        arrivedIds.push(ship.combatant.setup.id);
      }
    }
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
            !ship.active && ship.spawnAtSeconds > elapsedSeconds + 1e-8
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
