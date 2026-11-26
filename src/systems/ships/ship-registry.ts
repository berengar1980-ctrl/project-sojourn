import type {
  ResolvedShipGameplayStats,
  ShipDefinition,
  ShipHardpoint,
  ShipHardpoints,
  ShipRole,
} from '../../core/ship-types';
import { freighterVariantShips } from '../../data/ships/freighter-variant-ships';
import { careerMk4Ships } from '../../data/ships/career-mk4-ships';
import { minerVariantShips } from '../../data/ships/miner-variant-ships';
import { patrolVariantShips } from '../../data/ships/patrol-variant-ships';
import { pirateClassShips } from '../../data/ships/pirate-class-ships';
import { salvageVariantShips } from '../../data/ships/salvage-variant-ships';
import { SECURITY_DRONE_SHIP_ID } from '../../core/security-drone';
import { resolveShipGameplayStats } from './ship-stats';

function ensureUtilityHardpoints(definition: ShipDefinition): ShipDefinition {
  const points: ShipHardpoints = definition.sprite.hardpoints;
  const mount: ShipHardpoint = {
    id: 'utility-grapple',
    x: Math.max(0, Math.min(points.sourceWidth, points.pivot.x + points.sourceWidth * 0.24)),
    y: points.pivot.y,
    width: 3,
    layer: 'above',
  };
  const grappleMount: ShipHardpoint = {
    ...mount,
    id: 'utility-grapple',
    layer: 'below',
    x: Math.max(0, Math.min(points.sourceWidth, points.pivot.x - points.sourceWidth * 0.24)),
  };
  return {
    ...definition,
    sprite: {
      ...definition.sprite,
      hardpoints: {
        ...points,
        tractorBeams: points.tractorBeams?.length
          ? points.tractorBeams
          : [{ ...mount, id: 'utility-tractor' }],
        weaponMounts: points.weaponMounts ?? [],
        grapplingHooks: points.grapplingHooks?.length
          ? points.grapplingHooks.map((point) => ({ ...point, layer: 'below' as const }))
          : [grappleMount],
      },
    },
  };
}

/** GC-87 uses the existing round field sprite, with actual omnidirectional mounts. */
const securityDrone: ShipDefinition = {
  id: SECURITY_DRONE_SHIP_ID,
  name: 'GC-87 Sicherheitsdrohne',
  role: 'patrol',
  nominalLengthMeters: 24,
  cargoCapacityTons: 0,
  navigation: { cruiseSpeed: 250 },
  gameplayOverrides: {
    hullPoints: 160,
    shieldModifier: 1.6,
    maxComponentTier: 3,
    crewBerths: 0,
    weaponSlots: 3,
  },
  sprite: {
    assetUrl: '/drones/security-drone-gc87r8.webp',
    widthPx: 96,
    heightPx: 96,
    facing: 'right',
    hardpoints: {
      sourceWidth: 96,
      sourceHeight: 96,
      pivot: { x: 48, y: 48 },
      engines: [],
      maneuverThrusters: [],
      miningLasers: [],
      weaponMounts: [
        { id: 'gc87-laser-a', slotIndex: 0, x: 48, y: 24, width: 3, facing: 'forward', allowedMounts: ['turret'], allowedFamilies: ['pulse_laser'], arcDegrees: 360 },
        { id: 'gc87-laser-b', slotIndex: 1, x: 48, y: 72, width: 3, facing: 'forward', allowedMounts: ['turret'], allowedFamilies: ['pulse_laser'], arcDegrees: 360 },
        { id: 'gc87-missile', slotIndex: 2, x: 72, y: 48, width: 3, facing: 'forward', allowedMounts: ['guided'], allowedFamilies: ['guided_missile'], arcDegrees: 360 },
      ],
      shield: { centerX: 48, centerY: 48, radiusX: 72, radiusY: 72, maxHp: 100, modifier: 1 },
    },
  },
};

const definitions: readonly ShipDefinition[] = [
  securityDrone,
  ...patrolVariantShips,
  ...pirateClassShips,
  ...minerVariantShips,
  ...salvageVariantShips,
  ...freighterVariantShips,
  ...careerMk4Ships,
].map(ensureUtilityHardpoints);

export function getShipDefinition(id: string): ShipDefinition | null {
  return definitions.find((definition) => definition.id === id) ?? null;
}

export function getShipGameplayStats(id: string): ResolvedShipGameplayStats | null {
  const definition = getShipDefinition(id);
  return definition ? resolveShipGameplayStats(definition) : null;
}

export function getShipsByRole(role: ShipRole): readonly ShipDefinition[] {
  return definitions.filter(
    (definition) =>
      definition.id !== SECURITY_DRONE_SHIP_ID &&
      definition.role === role &&
      !definition.id.endsWith('-mk4') &&
      !definition.id.startsWith('pirate-')
  );
}

export function getAllShipDefinitions(): readonly ShipDefinition[] {
  return definitions.filter(
    (definition) =>
      definition.id !== SECURITY_DRONE_SHIP_ID &&
      !definition.id.endsWith('-mk4') && !definition.id.startsWith('pirate-')
  );
}
