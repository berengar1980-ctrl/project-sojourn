import type { LocalAsteroid, LocalShipState } from '../../core/local-space-types';
import { salvageSolidContactRadius } from '../../core/salvage-contact-profile';
import type {
  SalvageDebris,
  SalvageField,
  SalvageSection,
  SalvageWreck,
} from '../../core/salvage-types';
import type { ShipHardpoints } from '../../core/ship-types';
import { integrateAsteroids } from '../local-space/local-space-physics';
import {
  createShieldWorldGeometry,
  resolveAsteroidCollisions,
  resolveShieldCollisions,
  type ShieldCollisionImpact,
} from '../local-space/local-space-collision';

type SalvageBody = SalvageDebris | SalvageSection | SalvageWreck;
interface FieldRoster {
  readonly wrecks: readonly SalvageWreck[];
  readonly dynamic: readonly boolean[];
  readonly debris: readonly SalvageDebris[];
  readonly sections: readonly SalvageSection[];
}

interface WorldPhysics {
  readonly roster: FieldRoster;
  readonly owners: readonly SalvageBody[];
  readonly bodies: readonly LocalAsteroid[];
}
const physicsByField = new WeakMap<SalvageField, WorldPhysics>();

function isDynamicWreck(wreck: SalvageWreck): boolean {
  return Boolean(
    (wreck.containerVariant ||
      wreck.debrisVariant ||
      wreck.sectionVariant ||
      wreck.combatWreckVariant) &&
    wreck.driftVelocity &&
    wreck.rotation3d &&
    wreck.spin3d
  );
}

function ownersForField(field: SalvageField): SalvageBody[] {
  // Both selectable wrecks AND purely visual fragments are physical.
  // Click/scan eligibility and navigation planning are separate properties.
  const wreckIds = new Set(field.wrecks.map((wreck) => wreck.id));
  return [
    ...field.wrecks.filter(isDynamicWreck),
    ...(field.debris ?? []).filter((part) => !wreckIds.has(part.id)),
    ...(field.sections ?? []).filter((part) => !wreckIds.has(part.id)),
  ];
}

function toLocalAsteroid(owner: SalvageBody): LocalAsteroid {
  const velocity = owner.driftVelocity ?? { x: 0, y: 0 };
  const angularVelocity = owner.spin3d?.z ?? 0;
  const isHeavy =
    ('sectionVariant' in owner && Boolean(owner.sectionVariant)) ||
    ('combatWreckVariant' in owner && Boolean(owner.combatWreckVariant));
  const kind = isHeavy
    ? 'section'
    : 'containerVariant' in owner && owner.containerVariant
      ? 'container'
      : 'debris';
  const physicalRadius = salvageSolidContactRadius(owner.radius, kind);
  const density = isHeavy ? 10 : owner.radius >= 28 ? 3.2 : 1.3;
  const mass = Math.max(1, Math.PI * owner.radius ** 2 * density);
  return {
    id: owner.id,
    kind: isHeavy ? 'resource' : 'debris',
    // Small floating debris may be hit, pushed and thrown but must NOT
    // trigger detours. Only large room-scale ship sections block routes.
    routeBlocking: isHeavy,
    position: { ...owner.position },
    radius: physicalRadius,
    rotation: owner.rotation3d?.z ?? ('rotation' in owner ? owner.rotation : 0),
    physics: {
      mass,
      centerOfMassOffset: { x: 0, y: 0 },
      velocity: { ...velocity },
      angularVelocity,
      momentOfInertia: Math.max(1, 0.5 * mass * owner.radius ** 2),
    },
    deposits: [],
    scanLevel: 'unscanned',
  };
}

function sameRoster<T>(saved: readonly T[], live: readonly T[] | undefined): boolean {
  if (saved.length !== (live?.length ?? 0)) return false;
  for (let index = 0; index < saved.length; index++) {
    if (saved[index] !== live?.[index]) return false;
  }
  return true;
}

function rosterMatches(roster: FieldRoster, field: SalvageField): boolean {
  if (
    !sameRoster(roster.wrecks, field.wrecks) ||
    !sameRoster(roster.debris, field.debris) ||
    !sameRoster(roster.sections, field.sections)
  )
    return false;
  // An existing wreck can become dynamic (or stationary) without being replaced.
  for (let index = 0; index < field.wrecks.length; index++) {
    if (roster.dynamic[index] !== isDynamicWreck(field.wrecks[index]!)) return false;
  }
  return true;
}

function getPhysics(field: SalvageField): WorldPhysics {
  const previous = physicsByField.get(field);
  // The hot path allocates nothing. Validate contents, not only array identity:
  // combat, recovery and save restoration can splice or replace individual owners.
  if (previous && rosterMatches(previous.roster, field)) return previous;

  const owners = ownersForField(field);
  const roster: FieldRoster = {
    wrecks: [...field.wrecks],
    dynamic: field.wrecks.map(isDynamicWreck),
    debris: [...(field.debris ?? [])],
    sections: [...(field.sections ?? [])],
  };
  const bodies =
    previous && sameRoster(previous.owners, owners) ? previous.bodies : owners.map(toLocalAsteroid);
  const fresh: WorldPhysics = { roster, owners, bodies };
  physicsByField.set(field, fresh);
  return fresh;
}

function syncBodyPositions(world: WorldPhysics, dt: number): void {
  world.bodies.forEach((body, index) => {
    const owner = world.owners[index]!;
    owner.position = { ...body.position };
    owner.driftVelocity = { ...body.physics.velocity };
    if (owner.rotation3d && owner.spin3d) {
      owner.rotation3d = {
        x: (owner.rotation3d.x + owner.spin3d.x * dt) % (Math.PI * 2),
        y: (owner.rotation3d.y + owner.spin3d.y * dt) % (Math.PI * 2),
        z: body.rotation,
      };
    }
    if ('rotation' in owner) owner.rotation = body.rotation;
  });
}

/** Keep the asteroid engine authoritative instead of maintaining a second salvage solver. */
export function advanceSalvageContainerDrift(field: SalvageField, deltaSeconds: number): void {
  const dt = Math.min(0.05, Math.max(0, deltaSeconds));
  if (dt <= 0) return;
  const world = getPhysics(field);
  integrateAsteroids(world.bodies, dt, field.width, field.height);
  resolveAsteroidCollisions(world.bodies);
  syncBodyPositions(world, dt);
}

/** The same impulse-based shield interaction that pushes asteroids away. */
export function resolveSalvageShieldContacts(
  field: SalvageField,
  ship: LocalShipState,
  hardpoints: ShipHardpoints,
  lengthMeters: number
): ShieldCollisionImpact[] {
  const world = getPhysics(field);
  const heading = ship.headingRadians;
  const velocity = {
    x: Math.cos(heading) * ship.speed,
    y: Math.sin(heading) * ship.speed,
  };
  const collisions = resolveShieldCollisions(
    ship,
    velocity,
    world.bodies,
    createShieldWorldGeometry(hardpoints, lengthMeters)
  );
  syncBodyPositions(world, 0);
  return collisions;
}

/** Route planner and tactical combat use live positions from the same cached bodies. */
export function salvageFieldPhysicsBodies(field: SalvageField): readonly LocalAsteroid[] {
  return getPhysics(field).bodies;
}

/** Publish contacts resolved by the patrol/traffic controllers on the cached bodies. */
export function syncSalvagePhysicsContacts(field: SalvageField): void {
  syncBodyPositions(getPhysics(field), 0);
}

/** Called after combat consumed a throwable fragment to avoid resurrecting it. */
export function invalidateSalvagePhysics(field: SalvageField): void {
  physicsByField.delete(field);
}
