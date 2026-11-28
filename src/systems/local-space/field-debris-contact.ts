import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import type { ShipDefinition } from '../../core/ship-types';
import { shipShieldGeometry } from '../../core/ship-contact-geometry';
import { shipContactMassProperties } from '../../core/ship-contact-mass';
import { resolveShieldCollisions } from './local-space-collision';

function resolvedDebrisCount(asteroids: readonly LocalAsteroid[], resolve: () => void): number {
  const before = new Map(
    asteroids.map((rock) => [rock.id, { x: rock.position.x, y: rock.position.y }])
  );
  resolve();
  return asteroids.filter((rock) => {
    const original = before.get(rock.id);
    return (
      original && Math.hypot(rock.position.x - original.x, rock.position.y - original.y) > 0.001
    );
  }).length;
}

/** Small, non-blocking debris uses the same mass-aware shield contact as combat rocks. */
export function resolveFieldDebrisContacts(
  position: WorldPoint,
  velocity: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  shieldRadius: number,
  shipMass: number
): number {
  const debris = asteroids.filter((rock) => rock.kind === 'debris' && !rock.routeBlocking);
  return resolvedDebrisCount(debris, () =>
    resolveShieldCollisions(
      { position, headingRadians: 0 },
      velocity,
      debris,
      {
        centerOffset: { x: 0, y: 0 },
        radiusX: Math.max(0, shieldRadius),
        radiusY: Math.max(0, shieldRadius),
      },
      shipMass
    )
  );
}

/** Use metric ship geometry and the live XY velocity for every field ship. */
export function resolveShipFieldDebrisContacts(
  ship: ShipDefinition,
  pose: {
    readonly position: WorldPoint;
    readonly headingRadians: number;
    readonly velocity: WorldPoint;
  },
  rocks: readonly LocalAsteroid[]
): number {
  const geometry = shipShieldGeometry(ship);
  const mass = shipContactMassProperties(ship.nominalLengthMeters, geometry).mass;
  const debris = rocks.filter((rock) => rock.kind === 'debris' && !rock.routeBlocking);
  return resolvedDebrisCount(debris, () =>
    resolveShieldCollisions(pose, pose.velocity, debris, geometry, mass)
  );
}
