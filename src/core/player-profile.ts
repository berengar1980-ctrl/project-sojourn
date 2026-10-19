import type { ShipDefinition } from './ship-types';

export const PORTRAIT_IDS = [1, 2, 3, 4, 5] as const;
export type PortraitId = (typeof PORTRAIT_IDS)[number];

export interface PlayerProfile {
  readonly portraitId: PortraitId;
  readonly captainName: string;
  readonly shipName: string;
}

function validateName(value: string, label: string): string {
  const name = value.trim().normalize('NFC');
  if (!name || name.length > 32 || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
    throw new Error(label + ' muss zwischen 1 und 32 sichtbare Zeichen enthalten.');
  }
  return name;
}

export function createPlayerProfile(draft: PlayerProfile): PlayerProfile {
  if (!PORTRAIT_IDS.includes(draft.portraitId)) {
    throw new Error('Ungültiges Charakterporträt.');
  }
  return Object.freeze({
    portraitId: draft.portraitId,
    captainName: validateName(draft.captainName, 'Charaktername'),
    shipName: validateName(draft.shipName, 'Schiffsname'),
  });
}

export function snapshotPlayerProfile(profile: PlayerProfile): PlayerProfile {
  return {
    portraitId: profile.portraitId,
    captainName: profile.captainName,
    shipName: profile.shipName,
  };
}

export function playerPortraitUrl(portraitId: PortraitId): string | null {
  return portraitId === 2 || portraitId === 3
    ? null
    : '/portraits/portrait-' + portraitId + '.webp';
}

export function withPlayerShipName(
  ship: ShipDefinition,
  profile: PlayerProfile,
  starterShipId: string = ship.id
): ShipDefinition {
  return ship.id === starterShipId ? { ...ship, name: profile.shipName } : ship;
}
