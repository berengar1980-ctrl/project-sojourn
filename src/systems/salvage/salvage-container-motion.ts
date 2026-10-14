import type { LocalAsteroid, LocalShipState } from '../../core/local-space-types';
import type { SalvageDebris, SalvageField, SalvageSection, SalvageWreck } from '../../core/salvage-types';
import type { ShipHardpoints } from '../../core/ship-types';
import { integrateAsteroids } from '../local-space/local-space-physics';
import {
  createShieldWorldGeometry,
  resolveAsteroidCollisions,
  resolveShieldCollisions,
  type ShieldCollisionImpact,
} from '../local-space/local-space-collision';

type SalvageBody = SalvageDebris | SalvageSection | SalvageWreck;
interface WorldPhysics {
  readonly owners: readonly SalvageBody[];
  readonly bodies: readonly LocalAsteroid[];
}
const physicsByField = new WeakMap<SalvageField, WorldPhysics>();

function isDynamicWreck(wreck: SalvageWreck): boolean {
  return Boolean((wreck.containerVariant || wreck.debrisVariant || wreck.sectionVariant) && wreck.driftVelocity && wreck.rotation3d && wreck.spin3d);
}

function ownersForField(field: SalvageField): SalvageBody[] {
  return [
    ...field.wrecks.filter(isDynamicWreck),
    // Decorative debris without scan contacts is non-solid and never routed
    // around. Only salvageable, selectable wrecks participate in physics.
  ];
}

function toLocalAsteroid(owner: SalvageBody): LocalAsteroid {
  const velocity = owner.driftVelocity ?? { x: 0, y: 0 };
  const angularVelocity = owner.spin3d?.z ?? 0;
  const isHeavy = owner.radius >= 70;
  const density = isHeavy ? 10 : owner.radius >= 28 ? 3.2 : 1.3;
  const mass = Math.max(1, Math.PI * owner.radius ** 2 * density);
  return {
    id: owner.id,
    kind: isHeavy ? 'resource' : 'debris',
    routeBlocking: isHeavy || owner.radius >= 20,
    position: { ...owner.position },
    radius: owner.radius,
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

function getPhysics(field: SalvageField): WorldPhysics {
  const owners = ownersForField(field);
  const previous = physicsByField.get(field);
  if (previous &&
      previous.owners.length === owners.length &&
      previous.owners.every((owner, i) => owner === owners[i])) {
    return previous;
  }
  const fresh: WorldPhysics = { owners, bodies: owners.map(toLocalAsteroid) };
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

  // Keep the visual-only scraps drifting cheaply, without collisions against
  // ships, salvage targets, NPCs or other decorative pieces.
  for (const scrap of field.debris ?? []) {
    const margin = scrap.radius + 4;
    const minX = margin, minY = margin;
    const maxX = Math.max(minX, field.width - margin);
    const maxY = Math.max(minY, field.height - margin);
    let vx = scrap.driftVelocity.x;
    let vy = scrap.driftVelocity.y;
    if (scrap.position.x + vx * dt < minX || scrap.position.x + vx * dt > maxX) vx = -vx;
    if (scrap.position.y + vy * dt < minY || scrap.position.y + vy * dt > maxY) vy = -vy;
    scrap.driftVelocity = { x: vx, y: vy };
    scrap.position = {
      x: Math.max(minX, Math.min(maxX, scrap.position.x + vx * dt)),
      y: Math.max(minY, Math.min(maxY, scrap.position.y + vy * dt)),
    };
    scrap.rotation3d = {
      x: (scrap.rotation3d.x + scrap.spin3d.x * dt) % (Math.PI * 2),
      y: (scrap.rotation3d.y + scrap.spin3d.y * dt) % (Math.PI * 2),
      z: (scrap.rotation3d.z + scrap.spin3d.z * dt) % (Math.PI * 2),
    };
  }
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

/** Called after combat consumed a throwable fragment to avoid resurrecting it. */
export function invalidateSalvagePhysics(field: SalvageField): void {
  physicsByField.delete(field);
}
