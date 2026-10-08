import type { CrewDefinition, CrewMember } from '../../core/crew-types';
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
  member(id: string): CrewMember | null;
  availableDefinitions(): readonly CrewDefinition[];
  hire(id: string, ship: ShipDefinition): CrewMember | null;
  dismiss(id: string): CrewMember | null;
  assign(ship: ShipDefinition, stationId: string, crewId: string | null): boolean;
  assignments(ship: ShipDefinition): ShipStationAssignments;
  shipCrewMembers(): readonly ShipCrewMember[];
  runtimeOptions(ship: ShipDefinition): ShipRuntimeOptions;
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
      if (1 + members.length >= crewCapacity(ship)) return null;
      const definition = crewDefinitions.find((entry) => entry.id === id);
      if (!definition) return null;
      const member = createCrewMember(definition);
      members.push(member);
      return cloneMember(member);
    },

    dismiss(id) {
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

function createRosterAssignments(
  context: RosterContext
): Pick<
  CrewRosterService,
  | 'assign'
  | 'assignments'
  | 'shipCrewMembers'
  | 'runtimeOptions'
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

    shipCrewMembers() {
      return members.map((member) => ({
        id: member.id,
        skills: effectiveCrewSkills(member),
        stationModifiers: crewStationModifiers(member),
        injuryState: member.injuryState,
      }));
    },

    runtimeOptions(ship) {
      return {
        crew: members.map((member) => ({
          id: member.id,
          skills: effectiveCrewSkills(member),
          stationModifiers: crewStationModifiers(member),
          injuryState: member.injuryState,
        })),
        assignments: { ...assignmentRecord(ship) },
        manningFactor: crewManningStatus(ship, activeManningCount()).factor,
      };
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

export function createCrewRosterService(): CrewRosterService {
  const members: CrewMember[] = [];
  const assignmentsByShip = new Map<string, Record<string, string | undefined>>();

  function assignmentRecord(ship: ShipDefinition): Record<string, string | undefined> {
    const existing = assignmentsByShip.get(ship.id);
    if (existing) return existing;
    const record: Record<string, string | undefined> = {};
    for (const station of resolveShipGameplayStats(ship).stations) record[station.id] = undefined;
    assignmentsByShip.set(ship.id, record);
    return record;
  }

  function activeManningCount(): number {
    return members.filter(canOperateStation).length;
  }

  const context: RosterContext = {
    members,
    assignmentsByShip,
    assignmentRecord,
    activeManningCount,
  };
  return {
    ...createRosterManagement(context),
    ...createRosterAssignments(context),
    ...createRosterTraining(context),
  };
}
