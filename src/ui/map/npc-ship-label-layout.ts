export interface MapLabelBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NpcMapLabelRequest {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly shipWidth: number;
  readonly shipHeight: number;
  readonly isSelected: boolean;
  readonly isPursuitTarget: boolean;
  readonly isTravelling: boolean;
}

export interface NpcMapLabelPlacement {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly baseline: number;
}

function overlaps(first: MapLabelBox, second: MapLabelBox): boolean {
  return (
    Math.abs(first.x - second.x) < (first.width + second.width) / 2 + 4 &&
    Math.abs(first.y - second.y) < (first.height + second.height) / 2 + 4
  );
}

/** Text-only decluttering. Every physical NPC and its hit area remains present. */
export function layoutNpcMapLabels(
  requests: readonly NpcMapLabelRequest[],
  obstacles: readonly MapLabelBox[] = []
): NpcMapLabelPlacement[] {
  const occupied = [...obstacles];
  const placements: NpcMapLabelPlacement[] = [];
  const prioritized = [...requests].sort((first, second) => {
    const priority = (npc: NpcMapLabelRequest) =>
      npc.isSelected ? 3 : npc.isPursuitTarget ? 2 : npc.isTravelling ? 1 : 0;
    return priority(second) - priority(first) || first.id.localeCompare(second.id);
  });

  for (const npc of prioritized) {
    const width = Math.max(20, npc.name.length * 5.8 + 10);
    const halfWidth = npc.shipWidth / 2;
    const halfHeight = npc.shipHeight / 2;
    const options = [];
    // Multiple small lanes keep visible contacts labelled at overview zoom,
    // while never covering an already accepted name or a planet marker.
    for (const extra of [0, 16, 32, 48, 64]) {
      options.push(
        { x: npc.x, baseline: npc.y + halfHeight + 13 + extra },
        { x: npc.x, baseline: npc.y - halfHeight - 6 - extra },
        { x: npc.x + halfWidth + width / 2 + 9 + extra, baseline: npc.y + 3 },
        { x: npc.x - halfWidth - width / 2 - 9 - extra, baseline: npc.y + 3 }
      );
    }
    const pick = options.find((candidate) => {
      const box = { x: candidate.x, y: candidate.baseline - 4, width, height: 13 };
      return occupied.every((used) => !overlaps(box, used));
    });
    const chosen = pick ?? (npc.isSelected || npc.isPursuitTarget ? options[0] : null);
    if (!chosen) continue;
    occupied.push({ x: chosen.x, y: chosen.baseline - 4, width, height: 13 });
    placements.push({ id: npc.id, name: npc.name, ...chosen });
  }
  return placements;
}
