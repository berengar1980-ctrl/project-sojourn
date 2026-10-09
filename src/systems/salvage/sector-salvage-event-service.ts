import type {
  DistressActionResult,
  DistressDamageType,
  SalvageWreckKind,
  SectorSalvageEvent,
} from '../../core/salvage-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { WorldLocation, WorldMap, WorldPoint } from '../../core/world-types';
import {
  distressTrapChance,
  pickDistressProfile,
  pointDanger,
  profileFor,
  type DistressProfile,
} from './distress-profiles';

export const MAX_ACTIVE_SALVAGE_EVENTS = 3;
export const MAX_ACTIVE_DISTRESS_EVENTS = 1;
const WRECK_KINDS: readonly SalvageWreckKind[] = ['freighter', 'salvager', 'miner', 'patrol'];
function randomFrom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function clampPoint(world: WorldMap, point: WorldPoint): WorldPoint {
  return {
    x: Math.max(180, Math.min(world.width - 180, point.x)),
    y: Math.max(180, Math.min(world.height - 180, point.y)),
  };
}

function eventPosition(world: WorldMap, origin: WorldPoint, random: () => number): WorldPoint {
  const angle = random() * Math.PI * 2;
  const distance = 520 + random() * 980;
  return clampPoint(world, {
    x: origin.x + Math.cos(angle) * distance,
    y: origin.y + Math.sin(angle) * distance,
  });
}

function cloneEvent(event: SectorSalvageEvent): SectorSalvageEvent {
  return { ...event, position: { ...event.position } };
}

function nearestTowFacility(world: WorldMap, event: SectorSalvageEvent): WorldLocation | null {
  return (
    world.locations
      .filter(
        (location) =>
          location.activities.shipyard || location.activities.dock || location.activities.refuel
      )
      .map((location) => ({
        location,
        distance: Math.hypot(
          location.position.x - event.position.x,
          location.position.y - event.position.y
        ),
      }))
      .sort((first, second) => first.distance - second.distance)[0]?.location ?? null
  );
}

function emptyResult(text: string, success = false): DistressActionResult {
  return {
    success,
    text,
    boardingRequired: false,
    salvageRights: false,
    rewardCredits: 0,
    towDestinationId: null,
    workHours: 0,
  };
}

export interface SectorSalvageEventService {
  readonly active: readonly SectorSalvageEvent[];
  readonly playerVisible: readonly SectorSalvageEvent[];
  readonly currentDay: number;
  acceptForPlayer(id: string): boolean;
  event(id: string | null): SectorSalvageEvent | null;
  advanceDay(day: number, playerPosition: WorldPoint, playerHasSalvager: boolean): void;
  resolve(id: string): boolean;
  diagnoseDistress(id: string, engineeringSkill?: number): DistressActionResult | null;
  repairDistress(id: string, engineeringSkill: number): DistressActionResult | null;
  towDistress(id: string): DistressActionResult | null;
  finishTowAtLocation(locationId: string | null, eventId?: string): DistressActionResult | null;
  evacuateDistress(id: string): DistressActionResult | null;
  resolveBoarding(id: string, victory: boolean): DistressActionResult | null;
  grantSalvageRights(id: string): boolean;
  claimForNpc(id: string, npcId: string): boolean;
  releaseNpcClaim(id: string, npcId: string): void;
  resolveForNpc(id: string, npc: SectorNpcState): boolean;
}

class SectorSalvageEventRuntime implements SectorSalvageEventService {
  private readonly events: SectorSalvageEvent[] = [];
  private readonly random: () => number;
  private nextSpecialDay: number;
  private nextDistressDay: number;
  private serial = 0;
  currentDay = 0;
  private lastDistressDamage: DistressDamageType | null = null;

  constructor(
    private readonly world: WorldMap,
    seed: number
  ) {
    this.random = randomFrom(seed);
    this.nextSpecialDay = 0;
    this.nextDistressDay = 0;
  }

  get active(): readonly SectorSalvageEvent[] {
    return this.live().map(cloneEvent);
  }

  get playerVisible(): readonly SectorSalvageEvent[] {
    return this.active.filter(
      (event) => event.distressStage === 'towing' || this.currentDay < event.playerDeadlineDay
    );
  }

  acceptForPlayer(id: string): boolean {
    const event = this.event(id);
    if (!event || event.claimedByNpcId || this.currentDay >= event.playerDeadlineDay) {
      return false;
    }
    if (!event.playerAccepted) event.playerDeadlineDay += 3;
    event.playerAccepted = true;
    return true;
  }

  event(id: string | null): SectorSalvageEvent | null {
    if (!id) return null;
    return this.events.find((entry) => entry.id === id && !entry.resolved) ?? null;
  }

  advanceDay(day: number, playerPosition: WorldPoint, playerHasSalvager: boolean): void {
    this.currentDay = day;
    for (const event of this.events) {
      if (event.playerDeadlineDay <= day && event.distressStage !== 'towing') {
        event.playerAccepted = false;
      }
    }
    this.prune(day);
    if (!playerHasSalvager) return;
    if (day >= this.nextSpecialDay) {
      this.spawnSpecial(day, playerPosition);
      this.nextSpecialDay = day + 1 + Math.floor(this.random() * 2);
    }
    if (day >= this.nextDistressDay) {
      this.spawnDistress(day, playerPosition);
      this.nextDistressDay = day + 2 + Math.floor(this.random() * 3);
    }
  }

  resolve(id: string): boolean {
    const event = this.events.find((entry) => entry.id === id);
    if (!event || event.resolved) return false;
    event.resolved = true;
    return true;
  }

  diagnoseDistress(id: string, engineeringSkill = 20): DistressActionResult | null {
    const event = this.distress(id);
    if (!event || event.distressStage !== 'approach') return null;
    const profile = profileFor(event.distressDamage);
    event.distressStage = 'diagnosed';
    if (event.distressTrap) {
      return {
        ...emptyResult('Sensoranalyse: Notsignal manipuliert! Korsaren greifen das Enterteam an.'),
        boardingRequired: true,
      };
    }
    event.distressTechSkill = Math.max(0, Math.round(engineeringSkill));
    event.distressCanRepair = profile.repairable && event.distressTechSkill >= profile.skill;
    const guidance = profile.critical
      ? 'Evakuierung erforderlich.'
      : event.distressCanRepair
        ? 'Notreparatur möglich.'
        : 'Eigene Reparatur nicht möglich; Abschleppen erforderlich.';
    return {
      ...emptyResult(
        `Diagnose: ${profile.name} · ${profile.severity.toUpperCase()} · Technik ${event.distressTechSkill}/${profile.skill}. ${guidance}`,
        true
      ),
      workHours: 1.5,
    };
  }

  repairDistress(id: string, engineeringSkill: number): DistressActionResult | null {
    const event = this.distress(id);
    if (!event || event.distressStage !== 'diagnosed') return null;
    const profile = profileFor(event.distressDamage);
    const skill = Math.max(event.distressTechSkill ?? 0, Math.round(engineeringSkill));
    event.distressTechSkill = skill;
    event.distressCanRepair = profile.repairable && skill >= profile.skill;
    if (!event.distressCanRepair || profile.critical) {
      event.distressStage = 'tow_required';
      return emptyResult('Notreparatur nicht möglich. Das Schiff muss abgeschleppt werden.');
    }
    const chance = Math.min(0.95, Math.max(0.58, 0.58 + (skill - profile.skill) * 0.012));
    if (this.random() >= chance) {
      event.distressStage = 'tow_required';
      event.distressCanRepair = false;
      return {
        ...emptyResult(
          `Notreparatur fehlgeschlagen (${Math.round(chance * 100)} %). Abschleppen erforderlich.`
        ),
        workHours: profile.hours,
      };
    }
    return this.completeDistress(
      event,
      `Notreparatur erfolgreich: ${profile.name}.`,
      1,
      profile.hours
    );
  }

  towDistress(id: string): DistressActionResult | null {
    const event = this.distress(id);
    if (!event || !['diagnosed', 'tow_required'].includes(event.distressStage ?? '')) return null;
    const profile = profileFor(event.distressDamage);
    if (profile.critical || event.distressCanRepair) {
      return emptyResult(
        profile.critical
          ? 'Kritischer Schaden: Evakuierung erforderlich.'
          : 'Das Schiff kann vor Ort repariert werden.'
      );
    }
    const destination = nearestTowFacility(this.world, event);
    if (!destination) return emptyResult('Kein geeigneter Übergabehafen gefunden.');
    event.distressStage = 'towing';
    event.distressTowDestinationId = destination.id;
    event.distressPendingRewardCredits = this.reward(profile, 1.35);
    event.expiresDay += 2;
    return {
      ...emptyResult(`Schleppverbindung hergestellt. Übergabeziel: ${destination.name}.`, true),
      towDestinationId: destination.id,
    };
  }

  finishTowAtLocation(locationId: string | null, eventId?: string): DistressActionResult | null {
    if (!locationId) return null;
    const event = this.live().find(
      (candidate) =>
        candidate.type === 'distress-rescue' &&
        (!eventId || candidate.id === eventId) &&
        candidate.distressStage === 'towing' &&
        candidate.distressTowDestinationId === locationId
    );
    if (!event) return null;
    const destination = this.world.locations.find((location) => location.id === locationId);
    const reward = Math.max(0, event.distressPendingRewardCredits);
    event.distressPendingRewardCredits = 0;
    event.distressStage = 'resolved';
    event.resolved = true;
    return {
      ...emptyResult(
        `Abschleppung abgeschlossen: Havarist bei ${destination?.name ?? locationId} übergeben.`,
        true
      ),
      rewardCredits: reward,
    };
  }

  evacuateDistress(id: string): DistressActionResult | null {
    const event = this.distress(id);
    if (!event || event.distressStage !== 'diagnosed') return null;
    const profile = profileFor(event.distressDamage);
    if (!profile.critical)
      return emptyResult('Evakuierung ist bei diesem Schaden nicht erforderlich.');
    if (event.distressTrap) {
      return {
        ...emptyResult('Der Hilferuf ist ein Hinterhalt. Enterkampf ausgelöst.'),
        boardingRequired: true,
        workHours: 1,
      };
    }
    return this.completeDistress(event, `Evakuierung erfolgreich: ${profile.name}.`, 1.25, 3, true);
  }

  resolveBoarding(id: string, victory: boolean): DistressActionResult | null {
    const event = this.distress(id);
    if (!event) return null;
    if (!victory) {
      event.distressStage = 'resolved';
      event.resolved = true;
      return emptyResult('Hinterhalt: Das Enterteam musste den Einsatz abbrechen.');
    }
    return this.completeDistress(
      event,
      'Hinterhalt abgewehrt. Die Korsaren wurden besiegt.',
      1.55,
      2
    );
  }

  grantSalvageRights(id: string): boolean {
    const event = this.distress(id);
    if (!event) return false;
    this.applySalvageRights(event);
    return true;
  }

  claimForNpc(id: string, npcId: string): boolean {
    const event = this.event(id);
    if (
      !event ||
      event.playerAccepted ||
      event.distressStage === 'towing' ||
      this.currentDay < event.playerDeadlineDay ||
      (event.claimedByNpcId && event.claimedByNpcId !== npcId)
    ) {
      return false;
    }
    event.claimedByNpcId = npcId;
    return true;
  }

  releaseNpcClaim(id: string, npcId: string): void {
    const event = this.event(id);
    if (event?.claimedByNpcId === npcId) event.claimedByNpcId = null;
  }

  resolveForNpc(id: string, npc: SectorNpcState): boolean {
    const event = this.event(id);
    if (!event || event.claimedByNpcId !== npc.id) return false;
    event.resolved = true;
    npc.successfulRuns += 1;
    npc.activityId = 'salvage-event-complete';
    npc.activity = `Bergungsereignis abgeschlossen · ${event.title}`;
    return true;
  }

  private completeDistress(
    event: SectorSalvageEvent,
    text: string,
    rewardScale: number,
    workHours: number,
    allowSalvageRights = false
  ): DistressActionResult {
    const profile = profileFor(event.distressDamage);
    const reward = this.reward(profile, rewardScale);
    const insolvent = this.random() < 0.18;
    if (insolvent && allowSalvageRights && this.random() < 0.38) {
      this.applySalvageRights(event);
      return {
        ...emptyResult(
          text + ' Der Kapitän kann nicht zahlen und überträgt stattdessen Bergungsrechte.',
          true
        ),
        salvageRights: true,
        workHours,
      };
    }
    event.distressStage = 'resolved';
    event.resolved = true;
    return {
      ...emptyResult(
        text + (insolvent ? ' Ersatzleistung wird als Geldwert verrechnet.' : ''),
        true
      ),
      rewardCredits: reward,
      workHours,
    };
  }

  private applySalvageRights(event: SectorSalvageEvent): void {
    event.salvageRights = true;
    event.distressStage = 'salvage_rights';
    event.distressTowDestinationId = null;
    event.distressPendingRewardCredits = 0;
    event.expiresDay += 2;
  }

  private reward(profile: DistressProfile, scale: number): number {
    const [low, high] = profile.reward;
    return Math.round((low + this.random() * (high - low)) * scale);
  }

  private live(): SectorSalvageEvent[] {
    return this.events.filter((event) => !event.resolved);
  }

  private distress(id: string): SectorSalvageEvent | null {
    const event = this.event(id);
    return event?.type === 'distress-rescue' ? event : null;
  }

  private prune(day: number): void {
    for (const event of this.events) {
      if (
        !event.resolved &&
        event.expiresDay <= day &&
        !event.salvageRights &&
        !event.claimedByNpcId &&
        !event.playerAccepted &&
        event.distressStage !== 'towing'
      ) {
        event.resolved = true;
      }
    }
  }

  private spawnSpecial(day: number, origin: WorldPoint): void {
    if (this.live().length >= MAX_ACTIVE_SALVAGE_EVENTS) return;
    this.serial += 1;
    const kind = WRECK_KINDS[Math.floor(this.random() * WRECK_KINDS.length)] ?? 'freighter';
    this.events.push({
      id: `salvage-special-${day}-${this.serial}`,
      type: 'special-wreck',
      title: 'SELTENES BERGUNGSSIGNAL',
      description:
        'Auspexanalyse meldet ein ungewöhnlich gut erhaltenes Wrack. Modifizierte Schiffssysteme möglich.',
      position: eventPosition(this.world, origin, this.random),
      wreckKind: kind,
      fieldSeed: Math.floor(this.random() * 0x7fffffff),
      createdDay: day,
      playerDeadlineDay: day + 3,
      playerAccepted: false,
      expiresDay: day + 8,
      resolved: false,
      claimedByNpcId: null,
      specialComponent: true,
      distressDamage: null,
      distressStage: null,
      distressTrap: false,
      salvageRights: false,
      distressDamageName: null,
      distressSeverity: null,
      distressRequiredEngineering: null,
      distressRepairHours: 0,
      distressCanRepair: false,
      distressTechSkill: null,
      distressRewardMin: 0,
      distressRewardMax: 0,
      distressDangerLevel: 0,
      distressTowDestinationId: null,
      distressPendingRewardCredits: 0,
    });
  }

  private spawnDistress(day: number, origin: WorldPoint): void {
    if (this.live().length >= MAX_ACTIVE_SALVAGE_EVENTS) return;
    if (this.live().some((event) => event.type === 'distress-rescue')) return;
    this.serial += 1;
    const profile = pickDistressProfile(this.random, this.lastDistressDamage);
    this.lastDistressDamage = profile.id;
    const position = eventPosition(this.world, origin, this.random);
    const danger = pointDanger(this.world, position);
    this.events.push({
      id: `salvage-distress-${day}-${this.serial}`,
      type: 'distress-rescue',
      title: 'HILFERUF – SCHIFF IN NOT',
      description:
        'Ein beschädigtes Schiff sendet einen Hilferuf. Ursache und Reparierbarkeit sind unbekannt.',
      position,
      wreckKind: WRECK_KINDS[Math.floor(this.random() * WRECK_KINDS.length)] ?? 'freighter',
      fieldSeed: Math.floor(this.random() * 0x7fffffff),
      createdDay: day,
      playerDeadlineDay: day + 3,
      playerAccepted: false,
      expiresDay: day + 8,
      resolved: false,
      claimedByNpcId: null,
      specialComponent: false,
      distressDamage: profile.id,
      distressStage: 'approach',
      distressTrap: this.random() < distressTrapChance(danger),
      salvageRights: false,
      distressDamageName: profile.name,
      distressSeverity: profile.severity,
      distressRequiredEngineering: profile.skill,
      distressRepairHours: profile.hours,
      distressCanRepair: false,
      distressTechSkill: null,
      distressRewardMin: profile.reward[0],
      distressRewardMax: profile.reward[1],
      distressDangerLevel: danger,
      distressTowDestinationId: null,
      distressPendingRewardCredits: 0,
    });
  }
}

export function createSectorSalvageEventService(
  world: WorldMap,
  seed = 0x50a7a9e
): SectorSalvageEventService {
  return new SectorSalvageEventRuntime(world, seed);
}
