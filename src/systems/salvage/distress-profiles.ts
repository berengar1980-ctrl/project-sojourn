import type { DistressDamageType } from '../../core/salvage-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';

export interface DistressProfile {
  readonly id: DistressDamageType;
  readonly name: string;
  readonly severity: string;
  readonly repairable: boolean;
  readonly critical: boolean;
  readonly skill: number;
  readonly hours: number;
  readonly reward: readonly [number, number];
}

export const DISTRESS_PROFILES: readonly DistressProfile[] = [
  {
    id: 'nav_bus',
    name: 'Navigationsbus ausgefallen',
    severity: 'leicht',
    repairable: true,
    critical: false,
    skill: 28,
    hours: 2,
    reward: [300000, 450000],
  },
  {
    id: 'drive_control',
    name: 'Triebwerkssteuerung beschädigt',
    severity: 'mittel',
    repairable: true,
    critical: false,
    skill: 44,
    hours: 4,
    reward: [450000, 650000],
  },
  {
    id: 'power_grid',
    name: 'Energieverteiler zerstört',
    severity: 'schwer',
    repairable: true,
    critical: false,
    skill: 61,
    hours: 6,
    reward: [650000, 900000],
  },
  {
    id: 'main_drive',
    name: 'Hauptantrieb ausgefallen',
    severity: 'schwer',
    repairable: true,
    critical: false,
    skill: 72,
    hours: 8,
    reward: [850000, 1150000],
  },
  {
    id: 'coolant',
    name: 'Reaktorkühlkreis beschädigt',
    severity: 'kritisch',
    repairable: false,
    critical: true,
    skill: 82,
    hours: 0,
    reward: [950000, 1300000],
  },
  {
    id: 'hull_breach',
    name: 'Mehrfacher Rumpfbruch',
    severity: 'kritisch',
    repairable: false,
    critical: true,
    skill: 88,
    hours: 0,
    reward: [1150000, 1550000],
  },
  {
    id: 'total_loss',
    name: 'Struktureller Totalschaden',
    severity: 'Totalschaden',
    repairable: false,
    critical: true,
    skill: 100,
    hours: 0,
    reward: [1400000, 1900000],
  },
];

export function profileFor(damage: DistressDamageType | null): DistressProfile {
  return DISTRESS_PROFILES.find((profile) => profile.id === damage) ?? DISTRESS_PROFILES[2]!;
}

export function pickDistressProfile(
  random: () => number,
  previous: DistressDamageType | null
): DistressProfile {
  const roll = random();
  let profile =
    roll < 0.22
      ? DISTRESS_PROFILES[0]!
      : roll < 0.44
        ? DISTRESS_PROFILES[1]!
        : roll < 0.63
          ? DISTRESS_PROFILES[2]!
          : roll < 0.77
            ? DISTRESS_PROFILES[3]!
            : roll < 0.87
              ? DISTRESS_PROFILES[4]!
              : roll < 0.95
                ? DISTRESS_PROFILES[5]!
                : DISTRESS_PROFILES[6]!;
  if (profile.id === previous) {
    profile = DISTRESS_PROFILES.find((candidate) => candidate.id !== previous) ?? profile;
  }
  return profile;
}

export function pointDanger(world: WorldMap, point: WorldPoint): 0 | 1 | 2 | 3 {
  let danger: 0 | 1 | 2 | 3 = 0;
  for (const region of world.regions) {
    const distance = Math.hypot(point.x - region.center.x, point.y - region.center.y);
    if (distance <= region.radius) {
      danger = Math.max(danger, region.dangerLevel) as 0 | 1 | 2 | 3;
    }
  }
  return danger;
}

export function distressTrapChance(danger: 0 | 1 | 2 | 3): number {
  if (danger >= 3) return 0.15;
  if (danger === 2) return 0.08;
  return 0.03;
}
