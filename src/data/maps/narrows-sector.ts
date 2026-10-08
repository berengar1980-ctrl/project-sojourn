import type { WorldMap } from '../../core/world-types';

import { mapY } from './narrows-coordinates';
import { narrowsLocations1 } from './narrows-locations-1';
import { narrowsLocations2 } from './narrows-locations-2';
import { narrowsLocations3 } from './narrows-locations-3';

// prettier-ignore
export const narrowsSector: WorldMap = {
  id: 'narrows-sector',
  name: 'The Narrows',
  width: 6200,
  height: 5200,
  startLocationId: 'haven',
  star: {
    id: 'solis',
    name: 'Solis',
    position: { x: 3100, y: mapY(2600) },
    radius: 88,
    colorCore: '#fff4c7',
    colorCorona: '#f0a54a',
  },
  regions: [
    {
      id: 'blackjaw-reach',
      name: 'Blackjaw Reach',
      center: { x: 900, y: mapY(1350) },
      radius: 760,
      dangerLevel: 3,
    },
    {
      id: 'gallows-corridor',
      name: 'Gallows Corridor',
      center: { x: 5350, y: mapY(950) },
      radius: 680,
      dangerLevel: 3,
    },
    {
      id: 'deadlight-fringe',
      name: 'Deadlight Fringe',
      center: { x: 1200, y: mapY(3050) },
      radius: 650,
      dangerLevel: 2,
    },
    {
      id: 'sargasso-drift',
      name: 'Sargasso Drift',
      center: { x: 1450, y: mapY(4050) },
      radius: 620,
      dangerLevel: 2,
    },
    {
      id: 'pale-reach-hazard',
      name: 'Pale Reach Hazard',
      center: { x: 5100, y: mapY(4300) },
      radius: 720,
      dangerLevel: 3,
    },
    {
      id: 'frostline-fringe',
      name: 'Frostline Fringe',
      center: { x: 5450, y: mapY(4900) },
      radius: 520,
      dangerLevel: 2,
    },
  ],
  locations: [...narrowsLocations1, ...narrowsLocations2, ...narrowsLocations3],
};
