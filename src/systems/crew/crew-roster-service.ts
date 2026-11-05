import type { CrewDefinition, CrewMember, CrewSocialTraits } from '../../core/crew-types';
import type { PlayerProfile } from '../../core/player-profile';
import type { ShipDefinition, ShipStationSkill } from '../../core/ship-types';
import type { ShipRuntimeOptions } from '../ships/ship-runtime';
import { resolveShipGameplayStats } from '../ships/ship-stats';
import { crewDefinitions } from '../../data/crew/crew-definitions';
import type { ShipCrewMember, ShipStationAssignments } from '../ships/station-performance';
import {
  combatRoundsNeeded,
  createCrewMember,
  crewCapacity,
  crewManningStatus,
  crewStationModifiers,
  effectiveCrewSkills,
  stationTrainingDaysNeeded,
} from './crew-performance';

export interface CrewRosterService {
  list(): readonly CrewMember[];
  boardingEquipment(): readonly string[];
  grantBoardingEquipment(itemId: string): void;
  member(id: string): CrewMember | null;
  availableDefinitions(): readonly CrewDefinition[];
  hire(id: string, ship: ShipDefinition): CrewMember | null;
  dismiss(id: string): CrewMember | null;
  assign(ship: ShipDefinition, stationId: string, crewId: string | null): boolean;
  assignments(ship: ShipDefinition): ShipStationAssignments;
  transferAssignments(from: ShipDefinition, to: ShipDefinition): void;
  shipCrewMembers(): readonly ShipCrewMember[];
  runtimeOptions(ship: ShipDefinition): ShipRuntimeOptions;
  previewRuntimeOptions(ship: ShipDefinition, from?: ShipDefinition): ShipRuntimeOptions;
  manningFactor(ship: ShipDefinition): number;
  shareRate(): number;
  setInjuryState(id: string, state: CrewMember['injuryState']): CrewMember | null;
  accrueStationTraining(ship: ShipDefinition, hours?: number): void;
  accrueCombatTraining(crewId: string, mode: 'ranged' | 'melee', rounds?: number): void;
}

function cloneMember(member: CrewMember): CrewMember {
  return {
    ...member,
    socialTraits: { ...member.socialTraits },
    skills: { ...member.skills },
    combatSkills: { ...member.combatSkills },
    personalEquipment: { ...member.personalEquipment },
    morale: { ...member.morale },
    skillTrainingHours: { ...member.skillTrainingHours },
    combatTraining: { ...member.combatTraining },
  };
}

function canOperateStation(member: CrewMember): boolean {
  return member.injuryState !== 'incapacitated' && member.injuryState !== 'dead';
}

interface RosterContext {
  readonly members: CrewMember[];
  readonly assignmentsByShip: Map<string, Record<string, string | undefined>>;
  assignmentRecord(ship: ShipDefinition): Record<string, string | undefined>;
  peekAssignmentRecord(ship: ShipDefinition): Record<string, string | undefined>;
  activeManningCount(): number;
}

function createRosterManagement(
  context: RosterContext
): Pick<CrewRosterService, 'list' | 'member' | 'availableDefinitions' | 'hire' | 'dismiss'> {
  const { members, assignmentsByShip } = context;
  return {
    list() {
      return members.map(cloneMember);
    },

    member(id) {
      const member = members.find((entry) => entry.id === id);
      return member ? cloneMember(member) : null;
    },

    availableDefinitions() {
      const hired = new Set(members.map((member) => member.id));
      return crewDefinitions.filter((definition) => !hired.has(definition.id));
    },

    hire(id, ship) {
      if (members.some((member) => member.id === id)) return null;
      if (1 + members.filter((member) => member.id !== 'player').length >= crewCapacity(ship))
        return null;
      const definition = crewDefinitions.find((entry) => entry.id === id);
      if (!definition) return null;
      const member = createCrewMember(definition);
      members.push(member);
      return cloneMember(member);
    },

    dismiss(id) {
      if (id === 'player') return null;
      const index = members.findIndex((member) => member.id === id);
      if (index < 0) return null;
      const [member] = members.splice(index, 1);
      for (const record of assignmentsByShip.values()) {
        for (const stationId of Object.keys(record)) {
          if (record[stationId] === id) delete record[stationId];
        }
      }
      return member ? cloneMember(member) : null;
    },
  };
}

function projectedRosterAssignments(
  context: RosterContext,
  from: ShipDefinition,
  to: ShipDefinition
): Record<string, string | undefined> {
  const { members, peekAssignmentRecord } = context;
  const oldAssignments = peekAssignmentRecord(from);
  const next: Record<string, string | undefined> = {};
  const stations = resolveShipGameplayStats(to).stations;
  for (const station of stations) {
    const crewId = oldAssignments[station.id];
    if (!crewId) continue;
    const member = members.find((entry) => entry.id === crewId);
    if (member && canOperateStation(member)) next[station.id] = crewId;
  }
  // The captain must retain a post even when a different hull has no matching station.
  if (!Object.values(next).includes('player')) {
    const captain = members.find((entry) => entry.id === 'player');
    const firstFree = stations.find((station) => !next[station.id]);
    if (captain && canOperateStation(captain) && firstFree) next[firstFree.id] = 'player';
  }
  return next;
}

function transferRosterAssignments(
  context: RosterContext,
  from: ShipDefinition,
  to: ShipDefinition
): void {
  // An already configured hull keeps its own station layout on return.
  if (context.assignmentsByShip.has(to.id)) return;
  context.assignmentsByShip.set(to.id, projectedRosterAssignments(context, from, to));
}

function rosterRuntimeOptions(
  context: RosterContext,
  ship: ShipDefinition,
  assignments: ShipStationAssignments
): ShipRuntimeOptions {
  return {
    crew: context.members.map((member) => ({
      id: member.id,
      skills: effectiveCrewSkills(member),
      stationModifiers: crewStationModifiers(member),
      injuryState: member.injuryState,
    })),
    assignments: { ...assignments },
    manningFactor: crewManningStatus(ship, context.activeManningCount()).factor,
  };
}

function createRosterAssignments(
  context: RosterContext
): Pick<
  CrewRosterService,
  | 'assign'
  | 'assignments'
  | 'transferAssignments'
  | 'shipCrewMembers'
  | 'runtimeOptions'
  | 'previewRuntimeOptions'
  | 'manningFactor'
  | 'shareRate'
  | 'setInjuryState'
> {
  const { members, assignmentsByShip, assignmentRecord, activeManningCount } = context;
  return {
    assign(ship, stationId, crewId) {
      const validStations = new Set(
        resolveShipGameplayStats(ship).stations.map((station) => station.id)
      );
      if (!validStations.has(stationId)) return false;
      const record = assignmentRecord(ship);
      if (crewId === null) {
        delete record[stationId];
        return true;
      }
      const member = members.find((entry) => entry.id === crewId);
      if (!member || !canOperateStation(member)) return false;
      for (const key of Object.keys(record)) {
        if (record[key] === crewId) delete record[key];
      }
      record[stationId] = crewId;
      return true;
    },

    assignments(ship) {
      return { ...assignmentRecord(ship) };
    },

    transferAssignments(from, to) {
      transferRosterAssignments(context, from, to);
    },

    shipCrewMembers() {
      return members.map((member) => ({
        id: member.id,
        skills: effectiveCrewSkills(member),
        stationModifiers: crewStationModifiers(member),
        injuryState: member.injuryState,
      }));
    },

    runtimeOptions(ship) {
      return rosterRuntimeOptions(context, ship, assignmentRecord(ship));
    },

    previewRuntimeOptions(ship, from) {
      const assigned = assignmentsByShip.get(ship.id);
      let options = assigned;
      if (!options) {
        options = from
          ? projectedRosterAssignments(context, from, ship)
          : context.peekAssignmentRecord(ship);
      }
      return rosterRuntimeOptions(context, ship, options);
    },

    manningFactor(ship) {
      return crewManningStatus(ship, activeManningCount()).factor;
    },

    shareRate() {
      return Math.min(
        100,
        members
          .filter((member) => member.injuryState !== 'dead')
          .reduce((sum, member) => sum + Math.max(0, member.share), 0)
      );
    },

    setInjuryState(id, state) {
      const member = members.find((entry) => entry.id === id);
      if (!member) return null;
      member.injuryState = state;
      for (const record of assignmentsByShip.values()) {
        if (state !== 'incapacitated' && state !== 'dead') continue;
        for (const stationId of Object.keys(record)) {
          if (record[stationId] === id) delete record[stationId];
        }
      }
      return cloneMember(member);
    },
  };
}

function createRosterTraining(
  context: RosterContext
): Pick<CrewRosterService, 'accrueStationTraining' | 'accrueCombatTraining'> {
  const { members, assignmentRecord } = context;
  return {
    accrueStationTraining(ship, hours = 1) {
      if (hours <= 0) return;
      const assignments = assignmentRecord(ship);
      const stationSkills = new Map<string, ShipStationSkill>(
        resolveShipGameplayStats(ship).stations.map((station) => [station.id, station.skill])
      );
      for (const member of members) {
        const assignedStation = Object.entries(assignments).find(([, id]) => id === member.id)?.[0];
        if (!assignedStation) continue;
        const skill = stationSkills.get(assignedStation);
        if (!skill) continue;
        if (member.skills[skill] >= 85) continue;
        member.skillTrainingHours[skill] += hours;
        while (member.skills[skill] < 85) {
          const needed = stationTrainingDaysNeeded(member.skills[skill]) * 24;
          if (member.skillTrainingHours[skill] < needed) break;
          member.skillTrainingHours[skill] -= needed;
          member.skills[skill] += 1;
        }
      }
    },

    accrueCombatTraining(crewId, mode, rounds = 1) {
      const member = members.find((entry) => entry.id === crewId);
      if (!member || !canOperateStation(member) || rounds <= 0) return;
      member.combatTraining[mode] += rounds;
      while (member.combatSkills[mode] < 100) {
        const needed = combatRoundsNeeded(member.combatSkills[mode]);
        if (member.combatTraining[mode] < needed) break;
        member.combatTraining[mode] -= needed;
        member.combatSkills[mode] += 1;
      }
    },
  };
}

function createCaptainCrewMember(profile: PlayerProfile): CrewMember {
  const socialTraits: CrewSocialTraits = {
    loyalty: 0,
    order: 0,
    duty: 0,
    risk: 0,
    empathy: 0,
    faith: 0,
    cunning: 0,
    trust: 0,
  };
  return {
    ...createCrewMember({
      id: 'player',
      name: profile.captainName,
      title: 'Kapitän',
      share: 0,
      socialTraits,
      skills: profile.stationSkills,
      combatSkills: profile.combatSkills,
    }),
    portraitAssetUrl: null,
  };
}

export function createCrewRosterService(profile?: PlayerProfile): CrewRosterService {
  const members: CrewMember[] = profile ? [createCaptainCrewMember(profile)] : [];
  const boardingEquipment: string[] = [];
  const assignmentsByShip = new Map<string, Record<string, string | undefined>>();

  function peekAssignmentRecord(ship: ShipDefinition): Record<string, string | undefined> {
    const existing = assignmentsByShip.get(ship.id);
    if (existing) return existing;
    const record: Record<string, string | undefined> = {};
    for (const station of resolveShipGameplayStats(ship).stations) record[station.id] = undefined;
    if (profile && Object.hasOwn(record, profile.stationId)) {
      record[profile.stationId] = 'player';
    }
    return record;
  }

  function assignmentRecord(ship: ShipDefinition): Record<string, string | undefined> {
    const existing = assignmentsByShip.get(ship.id);
    if (existing) return existing;
    const record = peekAssignmentRecord(ship);
    assignmentsByShip.set(ship.id, record);
    return record;
  }

  function activeManningCount(): number {
    return members.filter((member) => member.id !== 'player' && canOperateStation(member)).length;
  }

  const context: RosterContext = {
    members,
    assignmentsByShip,
    assignmentRecord,
    peekAssignmentRecord,
    activeManningCount,
  };
  return {
    boardingEquipment: () => [...boardingEquipment],
    grantBoardingEquipment(itemId) {
      if (itemId) boardingEquipment.push(itemId);
    },
    ...createRosterManagement(context),
    ...createRosterAssignments(context),
    ...createRosterTraining(context),
  };
}
