import type { ShipDefinition, ShipStationSkill } from './ship-types';

export const PORTRAIT_IDS = [1, 2, 3, 4, 5] as const;
export type PortraitId = (typeof PORTRAIT_IDS)[number];
export const STATION_SKILLS = [
  'piloting',
  'sensors',
  'weapons',
  'engineering',
  'salvage',
  'mining',
  'logistics',
] as const satisfies readonly ShipStationSkill[];
export const COMBAT_POINT_BUDGET = 130;
export const STATION_POINT_BUDGET = 245;

export interface PlayerProfile {
  readonly portraitId: PortraitId;
  readonly captainName: string;
  readonly shipName: string;
  readonly combatSkills: Readonly<{ ranged: number; melee: number }>;
  readonly stationSkills: Readonly<Record<ShipStationSkill, number>>;
  readonly stationId: string;
}

export interface PlayerProfileDraft {
  readonly portraitId: PortraitId;
  readonly captainName: string;
  readonly shipName: string;
  readonly combatSkills?: PlayerProfile['combatSkills'];
  readonly stationSkills?: PlayerProfile['stationSkills'];
  readonly stationId?: string;
}

export function defaultStationSkills(): Record<ShipStationSkill, number> {
  return Object.fromEntries(STATION_SKILLS.map((skill) => [skill, 35])) as Record<
    ShipStationSkill,
    number
  >;
}

function validateName(value: string, label: string): string {
  const name = value.trim().normalize('NFC');
  if (!name || name.length > 32 || /\p{Cc}/u.test(name)) {
    throw new Error(label + ' muss zwischen 1 und 32 sichtbare Zeichen enthalten.');
  }
  return name;
}

function verifySkills<K extends string>(
  values: Readonly<Record<K, number>>,
  names: readonly K[],
  minimum: number,
  maximum: number,
  total: number
): void {
  if (
    names.some(
      (name) =>
        !Number.isInteger(values[name]) ||
        values[name]! < minimum ||
        values[name]! > maximum
    )
  ) {
    throw new Error('Ungültiger Fertigkeitswert.');
  }
  if (names.reduce((sum, name) => sum + values[name]!, 0) !== total) {
    throw new Error('Das Punktebudget muss vollständig verteilt werden.');
  }
}

export function createPlayerProfile(draft: PlayerProfileDraft): PlayerProfile {
  if (!PORTRAIT_IDS.includes(draft.portraitId)) {
    throw new Error('Ungültiges Charakterporträt.');
  }
  const combatSkills = { ...(draft.combatSkills ?? { ranged: 65, melee: 65 }) };
  const stationSkills = { ...(draft.stationSkills ?? defaultStationSkills()) };
  verifySkills(combatSkills, ['ranged', 'melee'], 30, 100, COMBAT_POINT_BUDGET);
  verifySkills(stationSkills, STATION_SKILLS, 10, 75, STATION_POINT_BUDGET);
  const stationId = draft.stationId ?? 'helm';
  if (!/^[a-z][a-z0-9_]*$/u.test(stationId)) {
    throw new Error('Ungültige Schiffsstation.');
  }
  return Object.freeze({
    portraitId: draft.portraitId,
    captainName: validateName(draft.captainName, 'Charaktername'),
    shipName: validateName(draft.shipName, 'Schiffsname'),
    combatSkills: Object.freeze(combatSkills),
    stationSkills: Object.freeze(stationSkills),
    stationId,
  });
}

export function snapshotPlayerProfile(profile: PlayerProfile): PlayerProfile {
  return {
    portraitId: profile.portraitId,
    captainName: profile.captainName,
    shipName: profile.shipName,
    combatSkills: { ...profile.combatSkills },
    stationSkills: { ...profile.stationSkills },
    stationId: profile.stationId,
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
