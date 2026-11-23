import type {
  StrategicCombatArenaOptions,
  StrategicCombatantSetup,
} from './strategic-combat-types';
import {
  DEFAULT_ARENA_WIDTH,
  DEFAULT_ARENA_HEIGHT,
  EDGE_PADDING,
  createRng,
  hashSeed,
} from './strategic-combat-geometry';

function initialCombatMotion(arenaOptions?: StrategicCombatArenaOptions) {
  return {
    ...(arenaOptions?.attackerVelocity ? { attackerVelocity: arenaOptions.attackerVelocity } : {}),
    ...(arenaOptions?.defenderVelocity ? { defenderVelocity: arenaOptions.defenderVelocity } : {}),
    ...(arenaOptions?.attackerHeadingRadians !== undefined
      ? { attackerHeadingRadians: arenaOptions.attackerHeadingRadians }
      : {}),
    ...(arenaOptions?.defenderHeadingRadians !== undefined
      ? { defenderHeadingRadians: arenaOptions.defenderHeadingRadians }
      : {}),
  };
}

function createArenaOptions(
  arenaOptions?: StrategicCombatArenaOptions
): StrategicCombatArenaOptions {
  const arena: StrategicCombatArenaOptions = {
    width: Math.max(800, arenaOptions?.width ?? DEFAULT_ARENA_WIDTH),
    height: Math.max(600, arenaOptions?.height ?? DEFAULT_ARENA_HEIGHT),
    ...(arenaOptions?.attackerPosition ? { attackerPosition: arenaOptions.attackerPosition } : {}),
    ...(arenaOptions?.defenderPosition ? { defenderPosition: arenaOptions.defenderPosition } : {}),
    ...initialCombatMotion(arenaOptions),
    ...(arenaOptions?.obstacles ? { obstacles: arenaOptions.obstacles } : {}),
    ...(arenaOptions?.asteroids ? { asteroids: arenaOptions.asteroids } : {}),
    ...(arenaOptions?.backdropSeed !== undefined
      ? { backdropSeed: arenaOptions.backdropSeed }
      : {}),
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
  return { ...arena, exitPoint: arenaOptions?.exitPoint ?? combatEscapeGate(arena, seed) };
}

/** The very same perimeter gate is visible before and during FleetCombat. */
export function combatEscapeGate(
  arena: StrategicCombatArenaOptions,
  seed: number
): { x: number; y: number } {
  if (arena.exitPoint) return arena.exitPoint;
  // One seeded perimeter sample, not a "furthest from pursuer" selection.
  // The old four-candidate scoring concentrated almost every gate on the left.
  const random = createRng(hashSeed(String(seed) + ':combat-exit'));
  const width = arena.width - EDGE_PADDING * 2;
  const height = arena.height - EDGE_PADDING * 2;
  const perimeter = 2 * (width + height);
  const sample = (): { x: number; y: number } => {
    const offset = random() * perimeter;
    if (offset < width) return { x: EDGE_PADDING + offset, y: EDGE_PADDING };
    if (offset < width + height)
      return { x: arena.width - EDGE_PADDING, y: EDGE_PADDING + offset - width };
    if (offset < 2 * width + height)
      return { x: EDGE_PADDING + 2 * width + height - offset, y: arena.height - EDGE_PADDING };
    return { x: EDGE_PADDING, y: EDGE_PADDING + perimeter - offset };
  };
  // Avoid placing the only exit inside an asteroid. Rejection is seeded and
  // performed once at setup, not in the frame-by-frame flight controller.
  let preferredGate = sample();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (
      !(arena.obstacles ?? []).some(
        (rock) =>
          Math.hypot(rock.position.x - preferredGate.x, rock.position.y - preferredGate.y) <
          rock.radius + 85
      )
    )
      break;
    preferredGate = sample();
  }
  return preferredGate;
}
