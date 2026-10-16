import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';

export interface StarMapPick {
  readonly kind: 'location' | 'npc';
  readonly id: string;
}

export interface StarMapPickOption extends StarMapPick {
  readonly name: string;
  readonly detail: string;
}

export interface StarMapHitArea extends StarMapPick {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export function collectStarMapPickOptions(
  areas: readonly StarMapHitArea[],
  model: StarMapViewModel,
  x: number,
  y: number
): StarMapPickOption[] {
  const matches = areas
    .filter((area) => Math.hypot(x - area.x, y - area.y) <= area.radius)
    .sort((first, second) => {
      if (first.kind !== second.kind) return first.kind === 'location' ? -1 : 1;
      return Math.hypot(x - first.x, y - first.y) - Math.hypot(x - second.x, y - second.y);
    });
  const unique = new Set<string>();
  const options: StarMapPickOption[] = [];
  for (const hit of matches) {
    const key = hit.kind + ':' + hit.id;
    if (unique.has(key)) continue;
    unique.add(key);
    if (hit.kind === 'npc') {
      const npc = model.npcShips.find((candidate) => candidate.id === hit.id);
      if (npc) {
        options.push({
          kind: 'npc',
          id: hit.id,
          name: npc.name,
          detail: 'SCHIFF // ' + npc.job.toUpperCase(),
        });
      }
    } else {
      const location = model.locations.find((candidate) => candidate.id === hit.id);
      if (location) {
        options.push({
          kind: 'location',
          id: hit.id,
          name: location.name,
          detail: location.kind.replace('-', ' ').toUpperCase(),
        });
      }
    }
  }
  return options;
}
