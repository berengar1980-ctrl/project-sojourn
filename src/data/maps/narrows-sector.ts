import type { WorldMap } from '../../core/world-types';

import { mapY } from './narrows-coordinates';
import { narrowsDangerZones } from './narrows-danger-zones';
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
  defaultDangerLevel: 3,
  regions: narrowsDangerZones,
  locations: [...narrowsLocations1, ...narrowsLocations2, ...narrowsLocations3],
};
