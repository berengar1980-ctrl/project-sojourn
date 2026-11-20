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

/** Fleet factions are identifiers, not hard-coded attacker/defender sides. */
export interface FleetCombatParticipant {
  readonly setup: StrategicCombatantSetup;
  readonly factionId: string;
  readonly position: CombatPoint;
  readonly headingRadians?: number;
  /** An uninvolved worker may remain neutral and can later be engaged. */
  readonly targetId?: string | null;
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
  nextTargetReview: number;
}

function advanceFleetMotion(
  fleet: readonly FleetShip[],
  acquire: (ship: FleetShip) => FleetShip | null,
  arena: StrategicCombatArenaOptions,
  dt: number
): void {
  for (const ship of fleet) {
    const actor = ship.combatant;
    actor.shieldImpacts = advanceShieldImpacts(actor.shieldImpacts, dt);
    if (actor.hullHp <= 0) continue;
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
  if (participants.length < 3) throw new Error('FleetCombat needs at least three ships');
  if (!(arena.width > 0 && arena.height > 0)) throw new Error('Invalid FleetCombat arena');
  const byId = new Map<string, FleetShip>();
  const fleet: FleetShip[] = [];
  for (const entry of participants) {
    const id = entry.setup.id;
    if (!id || byId.has(id)) throw new Error('Duplicate or empty FleetCombat ship ID: ' + id);
    if (!entry.factionId) throw new Error('Missing FleetCombat faction for ' + id);
    const combatant = createCombatant(entry.setup, 'attacker', {
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
      nextTargetReview: 0,
    };
    fleet.push(ship);
    byId.set(id, ship);
  }
  let elapsedSeconds = 0;
  let shots: FleetCombatShotSnapshot[] = [];

  const validEnemy = (ship: FleetShip, target: FleetShip | undefined): target is FleetShip =>
    !!target &&
    target !== ship &&
    target.combatant.hullHp > 0 &&
    target.factionId !== ship.factionId;

  const acquire = (ship: FleetShip): FleetShip | null => {
    // A current target is sticky, preventing tick-by-tick oscillation.
    const current = ship.targetId ? byId.get(ship.targetId) : undefined;
    if (validEnemy(ship, current)) return current;
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
    ship.targetId = selected?.combatant.setup.id ?? null;
    return selected;
  };

  const view = (): FleetCombatSnapshot => ({
    elapsedSeconds,
    ships: fleet.map((entry) => ({
      factionId: entry.factionId,
      targetId: entry.targetId,
      ship: snapshot(entry.combatant),
    })),
    shots: shots.map((shot) => ({
      ...shot,
      origin: { ...shot.origin },
      destination: { ...shot.destination },
    })),
    arena,
  });

  const step = (dt: number): void => {
    elapsedSeconds += dt;
    advanceFleetMotion(fleet, acquire, arena, dt);
    shots = advanceFleetFire(fleet, acquire, dt);
  };

  return {
    getSnapshot: view,
    tick(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return view();
      let remaining = Math.min(deltaSeconds, 0.5);
      while (remaining > 0.000001) {
        const dt = Math.min(remaining, 0.08);
        step(dt);
        remaining -= dt;
      }
      return view();
    },
    setTarget(shipId, targetId) {
      const ship = byId.get(shipId);
      if (!ship) throw new Error('Unknown FleetCombat ship: ' + shipId);
      if (targetId !== null && !validEnemy(ship, byId.get(targetId))) {
        throw new Error('Invalid FleetCombat target: ' + targetId);
      }
      ship.targetId = targetId;
    },
  };
}
