import type { WorldRegion } from '../../core/world-types';
import { mapY } from './narrows-coordinates';

// Voidbound-style curated topology, calibrated on a 6200 x 5200 sector grid.
// Small ellipsoid rooms overlap along actual corridors instead of six giant circles.
// At overview scale the fixed green/yellow/red field covers roughly one third each.
const point = (x: number, y: number) => ({ x, y: mapY(y) });
const ellipse = (x: number, y: number, radiusX: number, radiusY: number) => ({
  center: point(x, y),
  radiusX,
  radiusY,
});
const corridor = (
  ax: number, ay: number, bx: number, by: number, width: number
) => ({ from: point(ax, ay), to: point(bx, by), width });

export const narrowsDangerZones: readonly WorldRegion[] = [
  // YELLOW: linked frontier rooms and transit lanes, also running through inner space.
  {
    id: 'deadlight-fringe',
    name: 'Deadlight-Transitraum',
    center: point(2250, 2050),
    radius: 350,
    dangerLevel: 2,
    scale: 1.2,
    lobes: [ellipse(1850, 2100, 900, 750), ellipse(2850, 2150, 930, 700),
      ellipse(3760, 2550, 850, 680)],
    corridors: [corridor(790, 1800, 1550, 1950, 480),
      corridor(1550, 1950, 2300, 2280, 450),
      corridor(2300, 2280, 3350, 2200, 450),
      corridor(3350, 2200, 4650, 2650, 440)],
  },
  {
    id: 'sargasso-drift',
    name: 'Sargasso-Handelskorridor',
    center: point(1800, 4080),
    radius: 330,
    dangerLevel: 2,
    scale: 1.2,
    lobes: [ellipse(1000, 3450, 760, 720), ellipse(1840, 4080, 950, 750),
      ellipse(3020, 4550, 930, 570)],
    corridors: [corridor(650, 2450, 870, 3400, 430),
      corridor(870, 3400, 1600, 3940, 450),
      corridor(1600, 3940, 2450, 4500, 470),
      corridor(2450, 4500, 4000, 4700, 430)],
  },
  {
    id: 'frostline-fringe',
    name: 'Ostpassage',
    center: point(4900, 2450),
    radius: 350,
    dangerLevel: 2,
    scale: 1.2,
    lobes: [ellipse(4500, 1300, 720, 700), ellipse(5200, 2250, 730, 800),
      ellipse(4700, 3400, 800, 700)],
    corridors: [corridor(4400, 750, 4850, 1500, 430),
      corridor(4850, 1500, 5150, 2500, 470),
      corridor(5150, 2500, 4680, 3250, 460),
      corridor(4680, 3250, 5400, 3910, 450)],
  },
  // GREEN: connected, defensible civilian pockets and narrow safe shipping corridors.
  {
    id: 'haven-passage',
    name: 'Haven-Sicherheitskorridor',
    center: point(3440, 4000),
    radius: 320,
    dangerLevel: 1,
    scale: 0.9,
    lobes: [ellipse(3440, 4000, 800, 700), ellipse(2240, 3220, 590, 530),
      ellipse(4100, 4700, 700, 550)],
    corridors: [corridor(2240, 3220, 2850, 3450, 440),
      corridor(2850, 3450, 3500, 4050, 500),
      corridor(3500, 4050, 4080, 4700, 480)],
  },
  {
    id: 'helix-passage',
    name: 'Helix-Patrouillenpassage',
    center: point(1800, 950),
    radius: 260,
    dangerLevel: 1,
    scale: 0.9,
    lobes: [ellipse(1800, 950, 630, 580), ellipse(1456, 2000, 610, 520)],
    corridors: [corridor(1900, 650, 1650, 1250, 400),
      corridor(1650, 1250, 1420, 1980, 440)],
  },
  {
    id: 'niveus-passage',
    name: 'Niveus-Forschungsroute',
    center: point(4900, 1600),
    radius: 270,
    dangerLevel: 1,
    scale: 0.9,
    lobes: [ellipse(4600, 750, 620, 560), ellipse(5500, 1740, 580, 600),
      ellipse(4950, 2580, 570, 560)],
    corridors: [corridor(4550, 750, 4930, 1250, 390),
      corridor(4930, 1250, 5480, 1770, 400),
      corridor(5480, 1770, 5000, 2650, 430)],
  },
  {
    id: 'inner-civilian-link',
    name: 'Innere Handelspassagen',
    center: point(3200, 2900),
    radius: 250,
    dangerLevel: 1,
    scale: 0.9,
    lobes: [ellipse(2090, 4300, 630, 550), ellipse(4150, 1850, 560, 530)],
    corridors: [corridor(2090, 4300, 2460, 3600, 400),
      corridor(4130, 1870, 4240, 2650, 420),
      corridor(4240, 2650, 3650, 3900, 450)],
  },
  // RED: real pirate areas and special-value frontiers cut into the safer network.
  {
    id: 'blackjaw-reach',
    name: 'Blackjaw-Revier',
    center: point(750, 1050),
    radius: 310,
    dangerLevel: 3,
    lobes: [ellipse(750, 1050, 440, 440)],
  },
  {
    id: 'gallows-corridor',
    name: 'Gallows-Scherzone',
    center: point(5650, 700),
    radius: 300,
    dangerLevel: 3,
    lobes: [ellipse(5650, 700, 420, 400)],
  },
  {
    id: 'pale-reach-hazard',
    name: 'Pale-Reach-Ausschlussraum',
    center: point(3080, 200),
    radius: 300,
    dangerLevel: 3,
    lobes: [ellipse(3080, 200, 490, 430)],
  },
  {
    id: 'outer-shards-exclusion',
    name: 'Outer-Shards-Sperrgebiet',
    center: point(820, 4550),
    radius: 320,
    dangerLevel: 3,
    lobes: [ellipse(820, 4550, 460, 440)],
  },
  {
    id: 'halcyon-exclusion',
    name: 'Halcyon-Grenzraum',
    center: point(5850, 4570),
    radius: 290,
    dangerLevel: 3,
    lobes: [ellipse(5850, 4570, 390, 420)],
  },
];
