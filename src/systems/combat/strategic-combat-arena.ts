import type {
  StrategicCombatArenaOptions,
  StrategicCombatantSetup,
} from './strategic-combat-types';
import {
  DEFAULT_ARENA_WIDTH,
  DEFAULT_ARENA_HEIGHT,
  EDGE_PADDING,
  distance,
} from './strategic-combat-geometry';

function createArenaOptions(
  arenaOptions?: StrategicCombatArenaOptions
): StrategicCombatArenaOptions {
  const arena: StrategicCombatArenaOptions = {
    width: Math.max(800, arenaOptions?.width ?? DEFAULT_ARENA_WIDTH),
    height: Math.max(600, arenaOptions?.height ?? DEFAULT_ARENA_HEIGHT),
    ...(arenaOptions?.attackerPosition ? { attackerPosition: arenaOptions.attackerPosition } : {}),
    ...(arenaOptions?.defenderPosition ? { defenderPosition: arenaOptions.defenderPosition } : {}),
    ...(arenaOptions?.attackerVelocity ? { attackerVelocity: arenaOptions.attackerVelocity } : {}),
    ...(arenaOptions?.defenderVelocity ? { defenderVelocity: arenaOptions.defenderVelocity } : {}),
    ...(arenaOptions?.attackerHeadingRadians !== undefined
      ? { attackerHeadingRadians: arenaOptions.attackerHeadingRadians }
      : {}),
    ...(arenaOptions?.defenderHeadingRadians !== undefined
      ? { defenderHeadingRadians: arenaOptions.defenderHeadingRadians }
      : {}),
    ...(arenaOptions?.obstacles ? { obstacles: arenaOptions.obstacles } : {}),
    ...(arenaOptions?.asteroids ? { asteroids: arenaOptions.asteroids } : {}),
  };
  return arena;
}

export function buildCombatArena(
  attackerSetup: StrategicCombatantSetup,
  defenderSetup: StrategicCombatantSetup,
  seed: number,
  arenaOptions?: StrategicCombatArenaOptions
): StrategicCombatArenaOptions {
  const arena = createArenaOptions(arenaOptions);
  const margin = EDGE_PADDING;
  const along = 0.35 + (((seed >>> 5) % 101) / 100) * 0.3;
  const candidates = [
    { x: margin, y: arena.height * along },
    { x: arena.width - margin, y: arena.height * along },
    { x: arena.width * along, y: margin },
    { x: arena.width * along, y: arena.height - margin },
  ];
  const attackerPosition = arenaOptions?.attackerPosition ?? {
    x: arena.width * 0.35,
    y: arena.height * 0.5,
  };
  const defenderPosition = arenaOptions?.defenderPosition ?? {
    x: arena.width * 0.65,
    y: arena.height * 0.5,
  };
  const playerFlees =
    attackerSetup.preferredTactic === 'flee' || defenderSetup.preferredTactic !== 'flee';
  const runner = playerFlees ? attackerPosition : defenderPosition;
  const pursuer = playerFlees ? defenderPosition : attackerPosition;
  const preferredGate = candidates
    .map((point, index) => ({
      point,
      score: distance(point, pursuer) - distance(point, runner) * 0.4 + ((seed + index) % 4) * 2,
    }))
    .sort((a, b) => b.score - a.score)[0]!.point;
  const escapeArena: StrategicCombatArenaOptions = {
    ...arena,
    exitPoint: arenaOptions?.exitPoint ?? preferredGate,
  };
  return escapeArena;
}
