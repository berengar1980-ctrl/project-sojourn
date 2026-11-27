/** Stable pirate home ports. The legacy unknown-faction fallback is Blackjaw. */
const PIRATE_PORTS = {
  pirates: 'blackjaw-outpost',
  pirates2: 'gallows-anchor',
} as const;

export function pirateHomePort(factionId: string | undefined): string {
  return factionId === 'pirates2' ? PIRATE_PORTS.pirates2 : PIRATE_PORTS.pirates;
}

export function piratePortFaction(locationId: string): keyof typeof PIRATE_PORTS | null {
  if (locationId === PIRATE_PORTS.pirates) return 'pirates';
  if (locationId === PIRATE_PORTS.pirates2) return 'pirates2';
  return null;
}

/** Older NPCs may only carry a pirate mark rather than an explicit faction ID. */
export function pirateGroupId(pirate: {
  readonly factionId?: string;
  readonly pirateMark?: 'broken-spear' | 'black-tide';
}): string {
  return pirate.factionId ?? (pirate.pirateMark === 'black-tide' ? 'pirates2' : 'pirates');
}

export function pirateGroupMark(factionId: string | undefined): 'broken-spear' | 'black-tide' {
  return factionId === 'pirates2' ? 'black-tide' : 'broken-spear';
}
