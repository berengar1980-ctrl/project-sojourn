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
