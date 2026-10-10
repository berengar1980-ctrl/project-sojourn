import type { SectorNpcState } from '../../core/npc-types';
import type { SectorSalvageEvent } from '../../core/salvage-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import type { SectorSalvageEventService } from '../salvage/sector-salvage-event-service';
import { sectorSalvageEventComponent } from '../salvage/salvage-event-field-generator';
import {
  getShipComponent,
  salvagedComponentAppraisal,
  type ShipyardResearchService,
} from '../ships';
import { planRouteFromPoint, type RouteProfile } from '../navigation/route-planner';
import type { NpcSectorService } from './npc-sector-service';
import { tryNpcComponentUpgrade } from './npc-upgrade-service';

const FUEL_DISTANCE_SCALE = 0.025;

export interface NpcSalvageEventService {
  tick(): void;
}

interface NpcSalvageEventOptions {
  readonly world: WorldMap;
  readonly sector: NpcSectorService;
  readonly events: SectorSalvageEventService;
  readonly research: ShipyardResearchService;
}

function nearestShipyard(world: WorldMap, x: number, y: number): string | null {
  return (
    world.locations
      .filter((location) => location.activities.shipyard)
      .map((location) => ({
        id: location.id,
        distance: Math.hypot(location.position.x - x, location.position.y - y),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.id ?? null
  );
}

function npcRouteProfile(npc: SectorNpcState): RouteProfile {
  if (npc.pirate) return 'fast';
  if (npc.job === 'patrol') return npc.aggression >= 35 ? 'fast' : 'balanced';
  if (npc.aggression <= 28) return 'safe';
  if (npc.aggression >= 68) return 'fast';
  return npc.job === 'miner' || npc.job === 'salvager' ? 'safe' : 'balanced';
}

function eventTravelFuel(npc: SectorNpcState, distance: number): number {
  return Math.max(0.1, distance * npc.fuelUse * FUEL_DISTANCE_SCALE);
}

function startEventTravel(
  npc: SectorNpcState,
  from: WorldPoint,
  event: SectorSalvageEvent,
  reason: string
): boolean {
  const distance = Math.hypot(event.position.x - from.x, event.position.y - from.y);
  const fuelRequired = eventTravelFuel(npc, distance);
  if (fuelRequired > npc.fuel + 0.001) return false;
  npc.travel = {
    finalTargetId: event.id,
    targetLocationId: event.id,
    routePoints: [{ ...from }, { ...event.position }],
    routeDistance: distance,
    distanceTravelled: 0,
    fuelRequired,
    profile: npcRouteProfile(npc),
    refuelStops: [],
  };
  npc.activityId = 'salvage-event-travel';
  npc.activity = reason;
  return true;
}

function startReturnTravel(
  npc: SectorNpcState,
  world: WorldMap,
  from: WorldPoint,
  destinationId: string,
  reason: string
): boolean {
  const route = planRouteFromPoint(world, from, destinationId, npcRouteProfile(npc));
  const fuelRequired = eventTravelFuel(npc, route.distance);
  if (fuelRequired > npc.fuel + 0.001) return false;
  npc.travel = {
    finalTargetId: destinationId,
    targetLocationId: destinationId,
    routePoints: route.points,
    routeDistance: route.distance,
    distanceTravelled: 0,
    fuelRequired,
    profile: route.profile,
    refuelStops: [],
  };
  npc.activityId = 'salvage-return-travel';
  npc.activity = reason;
  return true;
}

function engineeringSkill(npc: SectorNpcState): number {
  return Math.min(90, 32 + npc.successfulRuns * 2 + (npc.workRiskPreference === 'safe' ? 8 : 0));
}

function npcBoardingVictory(npc: SectorNpcState): boolean {
  const strength = 34 + npc.aggression * 0.32 + Math.min(22, npc.successfulRuns * 1.5);
  return strength >= 58;
}

function recoverEventComponent(npc: SectorNpcState, event: SectorSalvageEvent): boolean {
  const component = sectorSalvageEventComponent(event);
  if (!component || !getShipComponent(component.type, component.componentId)) return false;
  npc.salvageComponents = [
    ...(npc.salvageComponents ?? []),
    { type: component.type, componentId: component.componentId },
  ];
  return true;
}

function sellRecoveredComponents(npc: SectorNpcState, research: ShipyardResearchService): boolean {
  const components = npc.salvageComponents ?? [];
  if (components.length === 0) return false;
  let total = 0;
  for (const item of components) {
    const appraisal = salvagedComponentAppraisal(item.type, item.componentId);
    total += appraisal.sell;
    research.registerComponent(item.type, item.componentId);
  }
  npc.salvageComponents = [];
  npc.credits += total;
  npc.activityId = 'salvage-components-sold';
  npc.activity = `Bergungskomponenten verkauft · ${total.toLocaleString('de-DE')} CR`;
  return total > 0;
}

class NpcSalvageEventRuntime implements NpcSalvageEventService {
  constructor(private readonly options: NpcSalvageEventOptions) {}

  tick(): void {
    for (const npc of this.options.sector.npcs) {
      if (npc.job === 'salvager') this.tickSalvager(npc);
    }
    this.applySharedShipyardResearch();
  }

  private tickSalvager(npc: SectorNpcState): void {
    if (npc.hullHp <= 0 || npc.combatMovement) return;
    this.sellAtShipyard(npc);
    if (npc.salvageEventId) {
      const event = this.options.events.event(npc.salvageEventId);
      if (
        event?.distressStage === 'towing' &&
        !npc.travel &&
        npc.locationId === event.distressTowDestinationId
      ) {
        const outcome = this.options.events.finishTowAtLocation(npc.locationId, event.id);
        if (outcome?.success) {
          npc.credits += outcome.rewardCredits;
          npc.successfulRuns += 1;
          npc.activityId = 'salvage-event-complete';
          npc.activity = 'Havarist im Zielhafen übergeben';
        }
        delete npc.salvageEventId;
        return;
      }
      this.progressClaimedEvent(npc);
      return;
    }
    if (!npc.travel) this.claimNextEvent(npc);
  }

  private sellAtShipyard(npc: SectorNpcState): void {
    if (npc.travel) return;
    const current = this.options.world.locations.find((location) => location.id === npc.locationId);
    if (current?.activities.shipyard) {
      sellRecoveredComponents(npc, this.options.research);
    }
  }

  private applySharedShipyardResearch(): void {
    for (const npc of this.options.sector.npcs) {
      if (npc.travel || npc.hullHp <= 0 || npc.combatMovement) continue;
      const location = this.options.world.locations.find(
        (candidate) => candidate.id === npc.locationId
      );
      if (!location?.activities.shipyard) continue;
      tryNpcComponentUpgrade(npc, (type, maxTier) => this.options.research.variants(type, maxTier));
    }
  }

  private progressClaimedEvent(npc: SectorNpcState): void {
    if (npc.travel || !npc.salvageEventId) return;
    const event = this.options.events.event(npc.salvageEventId);
    if (!event) {
      delete npc.salvageEventId;
      return;
    }
    if (npc.locationId !== event.id) return;

    const recovered =
      event.type === 'distress-rescue'
        ? this.resolveDistress(npc, event)
        : this.resolveSpecialWreck(npc, event);

    const updatedEvent = this.options.events.event(event.id);
    if (updatedEvent?.distressStage === 'towing' && updatedEvent.distressTowDestinationId) {
      const started = startReturnTravel(
        npc,
        this.options.world,
        event.position,
        updatedEvent.distressTowDestinationId,
        'Havarist zum Übergabehafen abschleppen'
      );
      if (!started) this.options.events.resolve(event.id);
      else return;
    }
    delete npc.salvageEventId;
    if (!recovered) {
      npc.activityId = 'salvage-event-complete';
      npc.activity = 'Bergungsereignis abgeschlossen';
    }
    this.returnToShipyard(npc, event);
  }

  private resolveSpecialWreck(npc: SectorNpcState, event: SectorSalvageEvent): boolean {
    const recovered = recoverEventComponent(npc, event);
    this.options.events.resolveForNpc(event.id, npc);
    return recovered;
  }

  private resolveDistress(npc: SectorNpcState, event: SectorSalvageEvent): boolean {
    const skill = engineeringSkill(npc);
    this.options.events.diagnoseDistress(event.id, skill);
    if (!event.distressDamage) return false;

    const critical = event.distressRepairHours === 0;
    if (!critical) {
      const repaired = this.options.events.repairDistress(event.id, skill);
      if (!repaired?.success) this.options.events.towDistress(event.id);
      return false;
    }

    const evacuation = this.options.events.evacuateDistress(event.id);
    if (evacuation?.boardingRequired) {
      this.options.events.resolveBoarding(event.id, npcBoardingVictory(npc));
      return false;
    }
    if (!evacuation?.salvageRights) return false;

    const rightsEvent = this.options.events.event(event.id);
    const recovered = rightsEvent ? recoverEventComponent(npc, rightsEvent) : false;
    this.options.events.resolve(event.id);
    return recovered;
  }

  private returnToShipyard(npc: SectorNpcState, event: SectorSalvageEvent): void {
    const shipyard = nearestShipyard(this.options.world, event.position.x, event.position.y);
    if (!shipyard) return;
    startReturnTravel(
      npc,
      this.options.world,
      event.position,
      shipyard,
      (npc.salvageComponents?.length ?? 0) > 0
        ? 'Bergungsfund zur Werft bringen'
        : 'Bergungseinsatz abschließen'
    );
  }

  private claimNextEvent(npc: SectorNpcState): void {
    const target = this.options.events.active
      .filter(
        (event) =>
          !event.claimedByNpcId &&
          !event.playerAccepted &&
          !this.options.events.playerVisible.some((visible) => visible.id === event.id)
      )
      .sort((a, b) => a.expiresDay - b.expiresDay)[0];
    if (!target) return;
    const contenders = this.options.sector.npcs
      .filter(
        (other) =>
          other.job === 'salvager' &&
          other.hullHp > 0 &&
          !other.combatMovement &&
          !other.travel &&
          !other.salvageEventId &&
          (() => {
            const at = this.options.sector.livePosition(other);
            const distance = Math.hypot(at.x - target.position.x, at.y - target.position.y);
            return eventTravelFuel(other, distance) <= other.fuel + 0.001;
          })()
      )
      .sort((first, second) => {
        const a = this.options.sector.livePosition(first);
        const c = this.options.sector.livePosition(second);
        const distanceA = Math.hypot(a.x - target.position.x, a.y - target.position.y);
        const distanceB = Math.hypot(c.x - target.position.x, c.y - target.position.y);
        return distanceA - distanceB || first.id.localeCompare(second.id);
      });
    if (contenders[0]?.id !== npc.id) return;
    if (!this.options.events.claimForNpc(target.id, npc.id)) return;

    const started = startEventTravel(
      npc,
      this.options.sector.livePosition(npc),
      target,
      'Bergungssignal anfliegen'
    );
    if (started) npc.salvageEventId = target.id;
    else this.options.events.releaseNpcClaim(target.id, npc.id);
  }
}

export function createNpcSalvageEventService(
  options: NpcSalvageEventOptions
): NpcSalvageEventService {
  return new NpcSalvageEventRuntime(options);
}
