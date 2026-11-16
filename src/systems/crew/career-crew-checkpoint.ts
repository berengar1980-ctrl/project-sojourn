import type { CrewMember } from '../../core/crew-types';
import { STATION_SKILLS } from '../../core/player-profile';
import { cloneCareerJson } from '../persistence/career-save-contract';
import { getShipDefinition } from '../ships/ship-registry';
import { resolveShipGameplayStats } from '../ships/ship-stats';

export interface CareerCrewCheckpoint {
  readonly version: 1;
  readonly members: readonly CrewMember[];
  readonly boardingEquipment: readonly string[];
  readonly assignments: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function bounded(value: unknown, low: number, high: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
}

function validNumbers(value: unknown, keys: readonly string[], low: number, high: number): boolean {
  return record(value) && keys.every((key) => bounded(value[key], low, high));
}

function validEquipment(value: unknown): boolean {
  const slots = ['ranged', 'melee', 'armor', 'gear1', 'gear2'];
  return (
    record(value) &&
    slots.every((slot) => value[slot] === null || typeof value[slot] === 'string')
  );
}

function validMemberIdentity(member: CrewMember): boolean {
  return (
    typeof member.id === 'string' &&
    member.id.length > 0 &&
    typeof member.name === 'string' &&
    typeof member.title === 'string' &&
    bounded(member.share, 0, 100) &&
    typeof member.elite === 'boolean' &&
    (member.portraitAssetUrl === null || typeof member.portraitAssetUrl === 'string') &&
    ['healthy', 'light_wound', 'severe_wound', 'incapacitated', 'dead'].includes(
      member.injuryState
    )
  );
}

function validMemberProgress(member: CrewMember): boolean {
  const skillKeys = [...STATION_SKILLS];
  const combatKeys = ['ranged', 'melee'];
  const socialKeys = ['loyalty', 'order', 'duty', 'risk', 'empathy', 'faith', 'cunning', 'trust'];
  const moraleKeys = ['motivation', 'loyalty', 'momentum', 'loyaltyMomentum'];
  return (
    validNumbers(member.skills, skillKeys, 0, 100) &&
    validNumbers(member.skillTrainingHours, skillKeys, 0, Number.MAX_SAFE_INTEGER) &&
    validNumbers(member.combatSkills, combatKeys, 0, 100) &&
    validNumbers(member.combatTraining, combatKeys, 0, Number.MAX_SAFE_INTEGER) &&
    validNumbers(member.socialTraits, socialKeys, -100, 100) &&
    validNumbers(member.morale, moraleKeys, -1000, 1000) &&
    validEquipment(member.personalEquipment)
  );
}

function validMember(member: CrewMember): boolean {
  return !!member && validMemberIdentity(member) && validMemberProgress(member);
}

function validateAssignments(
  assignments: CareerCrewCheckpoint['assignments'],
  memberIds: ReadonlySet<string>,
  unavailableIds: ReadonlySet<string>
): void {
  if (!record(assignments)) throw new Error('Invalid career crew assignments');
  for (const [shipId, stationAssignments] of Object.entries(assignments)) {
    const ship = getShipDefinition(shipId);
    if (!ship || !record(stationAssignments)) {
      throw new Error('Unknown saved crew ship');
    }
    const stations = new Set(resolveShipGameplayStats(ship).stations.map((station) => station.id));
    const assigned = new Set<string>();
    for (const [station, crewId] of Object.entries(stationAssignments)) {
      if (
        !stations.has(station) ||
        typeof crewId !== 'string' ||
        !memberIds.has(crewId) ||
        unavailableIds.has(crewId) ||
        assigned.has(crewId)
      ) {
        throw new Error('Invalid saved crew station assignment');
      }
      assigned.add(crewId);
    }
  }
}

/** Validate first and return a detached roster, never a reference into the running game. */
export function stageCareerCrewCheckpoint(candidate: unknown): CareerCrewCheckpoint {
  const saved = cloneCareerJson(candidate);
  if (
    !record(saved) ||
    saved.version !== 1 ||
    !Array.isArray(saved.members) ||
    saved.members.length > 200 ||
    !Array.isArray(saved.boardingEquipment) ||
    !record(saved.assignments)
  ) {
    throw new Error('Invalid career crew checkpoint');
  }
  const members = saved.members as CrewMember[];
  if (!members.every(validMember)) throw new Error('Invalid saved crew member');
  const ids = members.map((member) => member.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate saved crew member');
  if (
    saved.boardingEquipment.some((item) => typeof item !== 'string' || !item) ||
    saved.boardingEquipment.length > 1000
  ) {
    throw new Error('Invalid crew boarding equipment');
  }
  const unavailable = new Set(
    members
      .filter((member) => ['incapacitated', 'dead'].includes(member.injuryState))
      .map((member) => member.id)
  );
  validateAssignments(saved.assignments, new Set(ids), unavailable);
  return saved as unknown as CareerCrewCheckpoint;
}
