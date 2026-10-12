import type { StrategicCombatArenaOptions, StrategicCombatObstacle } from './strategic-combat-types';

export type DuelMapKind = 'empty' | 'scattered' | 'asteroid_field';
export const DUEL_MAPS: readonly { id: DuelMapKind; title: string }[] = [
  { id: 'empty', title: 'Leerer Raum' },
  { id: 'scattered', title: 'Einzelne Asteroiden · klein und groß' },
  { id: 'asteroid_field', title: 'Dichtes Asteroidenfeld' },
];

export function createDuelArena(kind: DuelMapKind, seed: number): StrategicCombatArenaOptions {
  const width = 4200;
  const height = 2600;
  if (kind === 'empty') return { width, height, obstacles: [] };
  let random = (seed ^ (kind === 'scattered' ? 0x2bad : 0x5eed)) >>> 0;
  const next = (): number => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 4294967296;
  };
  const count = kind === 'scattered' ? 12 : 56;
  const obstacles: StrategicCombatObstacle[] = [];
  for (let attempt = 0; attempt < count * 35 && obstacles.length < count; attempt += 1) {
    const radius = kind === 'scattered' ? 38 + next() * 145 : 22 + next() * 105;
    const position = {
      x: 180 + radius + next() * (width - 360 - radius * 2),
      y: 150 + radius + next() * (height - 300 - radius * 2),
    };
    const clearOfSpawn = [0.35, 0.65].every(
      (x) => Math.hypot(position.x - width * x, position.y - height * 0.5) > radius + 340
    );
    const clearOfRocks = obstacles.every(
      (obstacle) =>
        Math.hypot(position.x - obstacle.position.x, position.y - obstacle.position.y) >
        radius + obstacle.radius + 28
    );
    if (!clearOfSpawn || !clearOfRocks) continue;
    obstacles.push({ id: 'duel-rock-' + obstacles.length, position, radius });
  }
  return { width, height, obstacles };
}
