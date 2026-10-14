import { generateSalvageField } from '../salvage/salvage-field-generator';
import type { SalvageDebris, SalvageWreck } from '../../core/salvage-types';
import type { CombatVisualAsteroid, StrategicCombatArenaOptions } from './strategic-combat-types';

export type ScrapDuelDensity = 'moderate' | 'dense';

type ScrapSource = SalvageDebris | SalvageWreck;

/**
 * Build the PvP environment from the same wreck objects used by salvage,
 * without creating a second set of assets or collision/tractor mechanics.
 * Small debris is throwable combat ammunition; oversized room sections
 * provide actual cover. Both ship spawns retain clear maneuvering space.
 */
export function createScrapDuelArena(
  density: ScrapDuelDensity,
  seed: number
): StrategicCombatArenaOptions {
  const dense = density === 'dense';
  const width = dense ? 3000 : 3600;
  const height = dense ? 1900 : 2600;
  const field = generateSalvageField('pvp-scrap', seed, 2);
  const scaleX = width / field.width;
  const scaleY = height / field.height;
  const scale = Math.min(scaleX, scaleY);
  const extraField = dense ? generateSalvageField('pvp-scrap-extra', seed + 7919, 2) : null;
  const sourceWrecks = field.wrecks.filter((wreck) => wreck.debrisVariant);
  const largeSections = field.wrecks.filter((wreck) => wreck.sectionVariant);
  const containers = field.wrecks.filter((wreck) => wreck.containerVariant);
  const small: ScrapSource[] = [
    ...field.debris.slice(0, dense ? 85 : 22),
    ...sourceWrecks.slice(0, dense ? 40 : 20),
    // A second field reuses generated debris IDs ("debris-0", ...). Prefix
    // that layer or collisions/tractor capture will resolve the WRONG body.
    ...(extraField?.debris.slice(0, 45).map((debris) => ({
      ...debris,
      id: 'extra-' + debris.id,
    })) ?? []),
  ];
  const picked: ScrapSource[] = [
    ...small,
    ...containers.slice(0, dense ? 4 : 2),
    ...largeSections.slice(0, dense ? 8 : 3),
  ];

  // Use the exact same spawn defaults as createCombatant on the asteroid
  // maps. Previously wreck duels started much closer, enabling immediate
  // uncontested volleys instead of normal range acquisition and maneuvering.
  const spawns = [
    { x: width * 0.28, y: height * 0.46 },
    { x: width * 0.72, y: height * 0.54 },
  ];
  const asteroids: CombatVisualAsteroid[] = picked.flatMap((piece): CombatVisualAsteroid[] => {
    const isLarge = 'sectionVariant' in piece && Boolean(piece.sectionVariant);
    const position = {
      x: piece.position.x * scaleX,
      y: piece.position.y * scaleY,
    };
    const radius = piece.radius * scale;
    // The dense asteroid arena uses a full 145 m exclusion zone from both
    // spawns for EVERY rock, including debris. Wreck arenas must do likewise.
    const clearance = 145;
    if (
      position.x <= radius + 18 ||
      position.x >= width - radius - 18 ||
      position.y <= radius + 18 ||
      position.y >= height - radius - 18 ||
      spawns.some(
        (spawn) => Math.hypot(position.x - spawn.x, position.y - spawn.y) < radius + clearance
      )
    )
      return [];

    const model = piece as SalvageWreck;
    return [
      {
        id: 'pvp-' + piece.id,
        kind: isLarge ? 'resource' : 'debris',
        position,
        radius,
        velocity: {
          x: piece.driftVelocity?.x ?? 0,
          y: piece.driftVelocity?.y ?? 0,
        },
        rotation: piece.rotation3d?.z ?? 0,
        angularVelocity: piece.spin3d?.z ?? 0,
        ...(model.debrisVariant
          ? { debrisVariant: model.debrisVariant }
          : 'variant' in piece && !isLarge && !model.containerVariant
            ? { debrisVariant: piece.variant as SalvageDebris['variant'] }
            : {}),
        ...(model.sectionVariant ? { sectionVariant: model.sectionVariant } : {}),
        ...(model.containerVariant ? { containerVariant: model.containerVariant } : {}),
        ...(piece.rotation3d ? { rotation3d: { ...piece.rotation3d } } : {}),
        ...(piece.spin3d ? { spin3d: { ...piece.spin3d } } : {}),
        ...(piece.effectSeed !== undefined ? { effectSeed: piece.effectSeed } : {}),
      },
    ];
  });

  // Keep testable wreck ammunition available, but WITHOUT bypassing the
  // normal asteroid-map shield/tractor rules or changing combatant starts.
  // These pieces sit outside the same 145 m spawn clearance as mined rocks.
  for (let i = 0; i < 4; i += 1) {
    const source = field.debris[i]!;
    const player = i < 2 ? 0 : 1;
    const spawn = spawns[player]!;
    const side = player === 0 ? 1 : -1;
    asteroids.push({
      id: 'pvp-practice-scrap-' + seed + '-' + i,
      kind: 'debris',
      position: {
        x: spawn.x + side * (155 + (i % 2) * 35),
        y: spawn.y + (i % 2 ? -90 : 90),
      },
      radius: Math.max(9, Math.min(24, source.radius * scale)),
      rotation: source.rotation3d.z,
      velocity: { x: 0.2 * side, y: 0 },
      angularVelocity: source.spin3d.z,
      debrisVariant: source.variant,
      rotation3d: { ...source.rotation3d },
      spin3d: { ...source.spin3d },
      effectSeed: source.effectSeed,
    });
  }

  // Equivalent to the asteroid arena's kind === 'resource' rule: large
  // sections provide path blocking AND weapon cover; smaller debris remains
  // collidable and tractor-throwable without influencing route planning.
  const obstacles = asteroids
    .filter((piece) => piece.kind === 'resource')
    .map((piece) => ({
      id: piece.id,
      position: piece.position,
      radius: piece.radius,
    }));
  return {
    width,
    height,
    attackerPosition: spawns[0]!,
    defenderPosition: spawns[1]!,
    asteroids,
    obstacles,
  };
}
