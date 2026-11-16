import type { WorldLocation, WorldMap } from '../../core/world-types';
import {
  stageCareerCampaignWorldCheckpoint,
  type CareerCampaignWorldCheckpoint,
} from './career-campaign-world-checkpoint';
import type { NavigationService } from '../navigation/navigation-types';

export interface CampaignSystem {
  readonly map: WorldMap;
  readonly entryLocationId: string;
  readonly exitLocationId: string;
}

export interface CampaignWorldSnapshot {
  readonly activeSystemId: string | null;
  readonly locations: Readonly<Record<string, readonly WorldLocation[]>>;
  readonly systems: Readonly<Record<string, readonly CampaignSystem[]>>;
}

/** Runtime-owned, transient campaign worlds. No savegame or persistent storage. */
export interface CampaignWorldService {
  world(): WorldMap;
  inForeignSystem(): boolean;
  addLocation(campaignId: string, location: WorldLocation): boolean;
  addSystem(campaignId: string, system: CampaignSystem): boolean;
  enterSystem(campaignId: string, systemId: string): boolean;
  returnFromSystem(campaignId?: string): boolean;
  exitLocationId(): string | null;
  releaseCampaign(campaignId: string): void;
  snapshot(): CampaignWorldSnapshot;
  exportCareerState(): CareerCampaignWorldCheckpoint;
}

const ID = /^[a-z][a-z0-9_-]{0,79}$/u;

function detached<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validLocation(location: WorldLocation, world: WorldMap): boolean {
  return (
    ID.test(location.id) &&
    typeof location.name === 'string' &&
    location.name.trim().length > 0 &&
    location.name.length <= 100 &&
    Number.isFinite(location.position.x) &&
    Number.isFinite(location.position.y) &&
    location.position.x >= 0 &&
    location.position.y >= 0 &&
    location.position.x <= world.width &&
    location.position.y <= world.height &&
    Number.isFinite(location.radius) &&
    location.radius > 0 &&
    location.radius <= 150 &&
    [0, 1, 2, 3].includes(location.dangerLevel) &&
    location.activities?.missions === true &&
    !Object.entries(location.activities).some(([key, enabled]) => key !== 'missions' && enabled)
  );
}

function validSystemBounds(map: WorldMap, base: WorldMap): boolean {
  return (
    ID.test(map.id) &&
    map.id !== base.id &&
    !!map.name.trim() &&
    Number.isFinite(map.width) &&
    Number.isFinite(map.height) &&
    map.width >= 300 &&
    map.height >= 300 &&
    map.width <= 20000 &&
    map.height <= 20000 &&
    Number.isFinite(map.star.position.x) &&
    Number.isFinite(map.star.position.y) &&
    map.locations.length >= 2 &&
    map.locations.length <= 60 &&
    map.regions.length <= 30
  );
}

function validSystem(system: CampaignSystem, base: WorldMap): boolean {
  const map = system.map;
  if (!validSystemBounds(map, base)) return false;
  const ids = new Set(map.locations.map((location) => location.id));
  return (
    ids.size === map.locations.length &&
    ids.has(system.entryLocationId) &&
    ids.has(system.exitLocationId) &&
    ids.has(map.startLocationId) &&
    !map.locations.some((location) => base.locations.some((entry) => entry.id === location.id)) &&
    system.entryLocationId !== system.exitLocationId &&
    map.locations.every((location) => validLocation(location, map))
  );
}

function registerMissionLocation(
  campaignId: string,
  location: WorldLocation,
  baseWorld: WorldMap,
  records: Map<string, Map<string, WorldLocation>>,
  existingId: (id: string) => boolean,
  rebuildBase: () => void
): boolean {
  if (!ID.test(campaignId) || existingId(location.id) || !validLocation(location, baseWorld)) {
    return false;
  }
  const record = records.get(campaignId) ?? new Map<string, WorldLocation>();
  record.set(location.id, detached(location));
  records.set(campaignId, record);
  rebuildBase();
  return true;
}

function registerMissionSystem(
  campaignId: string,
  system: CampaignSystem,
  baseWorld: WorldMap,
  records: Map<string, Map<string, CampaignSystem>>
): boolean {
  if (!ID.test(campaignId) || !validSystem(system, baseWorld)) return false;
  const taken = [...records.values()].some((entries) => entries.has(system.map.id));
  if (taken) return false;
  const record = records.get(campaignId) ?? new Map<string, CampaignSystem>();
  record.set(system.map.id, detached(system));
  records.set(campaignId, record);
  return true;
}

function snapshotCampaignWorld(
  activeId: string | null,
  locations: Map<string, Map<string, WorldLocation>>,
  systems: Map<string, Map<string, CampaignSystem>>
): CampaignWorldSnapshot {
  return detached({
    activeSystemId: activeId,
    locations: Object.fromEntries(
      [...locations].map(([id, records]) => [id, [...records.values()]])
    ),
    systems: Object.fromEntries([...systems].map(([id, records]) => [id, [...records.values()]])),
  });
}

export function createCampaignWorldService(
  baseWorld: WorldMap,
  navigation: NavigationService,
  checkpoint?: CareerCampaignWorldCheckpoint
): CampaignWorldService {
  const locations = new Map<string, Map<string, WorldLocation>>();
  const systems = new Map<string, Map<string, CampaignSystem>>();
  let active: { owner: string; id: string; returnLocationId: string } | null = null;
  let revision = 0;
  let baseView: WorldMap = baseWorld;
  let restoring = checkpoint !== undefined;

  function rebuildBase(): void {
    revision += 1;
    baseView = {
      ...baseWorld,
      id: baseWorld.id + '-campaign-' + revision,
      locations: [
        ...baseWorld.locations,
        ...[...locations.values()].flatMap((entries) => [...entries.values()]),
      ],
    };
    if (!active && !restoring) navigation.replaceWorld(baseView);
  }

  function existingId(id: string): boolean {
    if (baseWorld.locations.some((location) => location.id === id)) return true;
    return [...locations.values()].some((entries) => entries.has(id));
  }

  if (checkpoint) {
    const restored = stageCareerCampaignWorldCheckpoint(checkpoint);
    for (const [owner, entries] of Object.entries(restored.snapshot.locations)) {
      for (const location of entries) {
        if (!registerMissionLocation(owner, location, baseWorld, locations, existingId, rebuildBase)) {
          throw new Error('Invalid restored mission location');
        }
      }
    }
    for (const [owner, entries] of Object.entries(restored.snapshot.systems)) {
      for (const system of entries) {
        if (!registerMissionSystem(owner, system, baseWorld, systems)) {
          throw new Error('Invalid restored campaign system');
        }
      }
    }
    const savedActive = restored.active;
    if (savedActive) {
      const system = systems.get(savedActive.owner)?.get(savedActive.id);
      if (
        !system ||
        !baseView.locations.some((item) => item.id === savedActive.returnLocationId)
      ) {
        throw new Error('Unknown restored campaign system or return point');
      }
      active = { ...savedActive };
      if (navigation.getSnapshot().currentLocationId &&
          !system.map.locations.some(
            (item) => item.id === navigation.getSnapshot().currentLocationId
          )) {
        throw new Error('Saved navigation is outside the campaign system');
      }
    }
    restoring = false;
    if (!active) navigation.replaceWorld(baseView);
  }

  function foreign(): CampaignSystem | null {
    return active ? (systems.get(active.owner)?.get(active.id) ?? null) : null;
  }

  function returnHome(force: boolean): boolean {
    if (!active) return false;
    const system = foreign();
    if (!force && navigation.getSnapshot().currentLocationId !== system?.exitLocationId) {
      return false;
    }
    const home = active.returnLocationId;
    const validHome = baseView.locations.some((location) => location.id === home)
      ? home
      : baseWorld.startLocationId;
    if (!navigation.setWorld(baseView, validHome)) return false;
    active = null;
    return true;
  }

  return {
    world() {
      return foreign()?.map ?? baseView;
    },
    inForeignSystem() {
      return active !== null;
    },
    exitLocationId() {
      return foreign()?.exitLocationId ?? null;
    },
    addLocation: (id, location) =>
      registerMissionLocation(id, location, baseWorld, locations, existingId, rebuildBase),
    addSystem: (id, system) => registerMissionSystem(id, system, baseWorld, systems),
    enterSystem(campaignId, systemId) {
      if (active || navigation.getSnapshot().isTravelling) return false;
      const system = systems.get(campaignId)?.get(systemId);
      if (!system) return false;
      const locationId = navigation.getSnapshot().currentLocationId;
      const home =
        locationId && baseView.locations.some((location) => location.id === locationId)
          ? locationId
          : baseWorld.startLocationId;
      if (!navigation.setWorld(system.map, system.entryLocationId)) return false;
      active = { owner: campaignId, id: systemId, returnLocationId: home };
      return true;
    },
    returnFromSystem(campaignId) {
      return (!campaignId || active?.owner === campaignId) && returnHome(false);
    },
    releaseCampaign(campaignId) {
      if (active?.owner === campaignId) {
        if (locations.get(campaignId)?.has(active.returnLocationId)) {
          active.returnLocationId = baseWorld.startLocationId;
        }
        returnHome(true);
      }
      locations.delete(campaignId);
      systems.delete(campaignId);
      rebuildBase();
    },
    snapshot: () => snapshotCampaignWorld(active?.id ?? null, locations, systems),
    exportCareerState: () => ({
      version: 1,
      snapshot: snapshotCampaignWorld(active?.id ?? null, locations, systems),
      active: active ? { ...active } : null,
    }),
  };
}
