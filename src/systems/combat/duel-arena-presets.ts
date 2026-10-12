import { generateMiningSpace } from '../local-space/local-space-generator';
import type { StrategicCombatArenaOptions } from './strategic-combat-types';

export type DuelMapKind = 'empty' | 'scattered' | 'asteroid_field';
export const DUEL_MAPS: readonly { id: DuelMapKind; title: string }[] = [
  { id: 'empty', title: 'Leerer Raum' },
  { id: 'scattered', title: 'Einzelne Asteroiden · klein und groß' },
  { id: 'asteroid_field', title: 'Dichtes Asteroidenfeld' },
];

export function createDuelArena(kind: DuelMapKind, seed: number): StrategicCombatArenaOptions {
  const width = kind === 'asteroid_field' ? 3000 : 4200;
  const height = kind === 'asteroid_field' ? 1900 : 2600;
  if (kind === 'empty') return { width, height, obstacles: [], asteroids: [] };
  // Use the SAME source as the actual mining field, including rock shape IDs and rotation.
  const field = generateMiningSpace('duel', seed);
  const extra = kind === 'asteroid_field' ? generateMiningSpace('duel-dense', seed + 7919) : null;
  const factorX = width / field.width;
  const factorY = height / field.height;
  const scale = Math.min(factorX, factorY);
  // Both layers come directly from the campaign generator. The second layer
  // adds solid rocks without doubling the small visual-only debris.
  const sourceAsteroids = extra
    ? [...field.asteroids, ...extra.asteroids.filter((asteroid) => asteroid.kind === 'resource')]
    : field.asteroids;
  const asteroids = sourceAsteroids
    .filter((asteroid) => kind === 'asteroid_field' || asteroid.kind === 'resource')
    .filter((asteroid, index) => kind === 'asteroid_field' || index % 5 === 0)
    .map((asteroid, index) => ({
      id: asteroid.id,
      kind: asteroid.kind,
      position:
        kind === 'asteroid_field'
          ? {
              x: asteroid.radius * scale + 24 +
                ((Math.sin((index + 1) * 127.1 + seed * 0.73) * 43758.5453 % 1 + 1) % 1) *
                  (width - 2 * (asteroid.radius * scale + 24)),
              y: asteroid.radius * scale + 24 +
                ((Math.sin((index + 1) * 311.7 + seed * 1.13) * 23871.8321 % 1 + 1) % 1) *
                  (height - 2 * (asteroid.radius * scale + 24)),
            }
          : { x: asteroid.position.x * factorX, y: asteroid.position.y * factorY },
      radius: asteroid.radius * scale,
      rotation: asteroid.rotation,
      velocity: {
        x: asteroid.physics.velocity.x * factorX,
        y: asteroid.physics.velocity.y * factorY,
      },
      angularVelocity: asteroid.physics.angularVelocity,
      physics: {
        ...asteroid.physics,
        velocity: {
          x: asteroid.physics.velocity.x * factorX,
          y: asteroid.physics.velocity.y * factorY,
        },
      },
    }))
    .filter(
      (asteroid) =>
        asteroid.position.x > asteroid.radius &&
        asteroid.position.x < width - asteroid.radius &&
        asteroid.position.y > asteroid.radius &&
        asteroid.position.y < height - asteroid.radius
    )
    .filter((asteroid) =>
      [0.35, 0.65].every(
        (x) =>
          Math.hypot(asteroid.position.x - width * x, asteroid.position.y - height * 0.5) >
          asteroid.radius + (kind === 'asteroid_field' ? 145 : 340)
      )
    );
  return {
    width,
    height,
    asteroids,
    // Small drifting debris is visual-only, exactly as in the local asteroid field.
    obstacles: asteroids
      .filter((asteroid) => asteroid.kind === 'resource')
      .map((asteroid) => ({
        id: asteroid.id,
        position: asteroid.position,
        radius: asteroid.radius,
      })),
  };
}
