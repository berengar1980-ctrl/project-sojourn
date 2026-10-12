import { generateMiningSpace } from '../local-space/local-space-generator';
import type { StrategicCombatArenaOptions } from './strategic-combat-types';

export type DuelMapKind = 'empty' | 'scattered' | 'asteroid_field';
export const DUEL_MAPS: readonly { id: DuelMapKind; title: string }[] = [
  { id: 'empty', title: 'Leerer Raum' },
  { id: 'scattered', title: 'Einzelne Asteroiden · klein und groß' },
  { id: 'asteroid_field', title: 'Dichtes Asteroidenfeld' },
];

export function createDuelArena(kind: DuelMapKind, seed: number): StrategicCombatArenaOptions {
  const width = 4200;
  const height = 2600;
  if (kind === 'empty') return { width, height, obstacles: [], asteroids: [] };
  // Use the SAME source as the actual mining field, including rock shape IDs and rotation.
  const field = generateMiningSpace('duel', seed);
  const factorX = width / field.width;
  const factorY = height / field.height;
  const scale = Math.min(factorX, factorY);
  const asteroids = field.asteroids
    .filter((asteroid) => kind === 'asteroid_field' || asteroid.kind === 'resource')
    .filter((asteroid, index) => kind === 'asteroid_field' || index % 5 === 0)
    .map((asteroid) => ({
      id: asteroid.id,
      kind: asteroid.kind,
      position: { x: asteroid.position.x * factorX, y: asteroid.position.y * factorY },
      radius: asteroid.radius * scale,
      rotation: asteroid.rotation,
      velocity: {
        x: asteroid.physics.velocity.x * factorX,
        y: asteroid.physics.velocity.y * factorY,
      },
      angularVelocity: asteroid.physics.angularVelocity,
    }))
    .filter((asteroid) =>
      [0.35, 0.65].every(
        (x) =>
          Math.hypot(asteroid.position.x - width * x, asteroid.position.y - height * 0.5) >
          asteroid.radius + 340
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
