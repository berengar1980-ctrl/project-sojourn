import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap } from '../../core/world-types';
import type { NpcSectorService } from './npc-sector-service';

export interface PirateNpcService {
  tick(deltaSeconds: number): void;
}

interface PirateNpcServiceOptions {
  readonly world: WorldMap;
  readonly npcs: SectorNpcState[];
  readonly sector: NpcSectorService;
  readonly log: (message: string) => void;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function distance(
  first: { readonly x: number; readonly y: number },
  second: { readonly x: number; readonly y: number }
): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pirateFactionLabel(npc: SectorNpcState): string {
  return npc.pirateFaction === 'black-tide' ? 'Schwarze Flut' : 'Harrow-Korsaren';
}

function eligiblePrey(npc: SectorNpcState): boolean {
  return !npc.pirate && npc.hullHp > 0 && ['freighter', 'miner', 'salvager'].includes(npc.job);
}

function locationTraffic(
  world: WorldMap,
  sector: NpcSectorService,
  npcs: readonly SectorNpcState[],
  locationId: string
): number {
  const location = world.locations.find((entry) => entry.id === locationId);
  if (!location) return 0;
  return npcs
    .filter(eligiblePrey)
    .reduce((sum, npc) => {
      const position = sector.livePosition(npc);
      const range = distance(position, location.position);
      return sum + (range <= 900 ? 1 : range <= 1500 ? 0.35 : 0);
    }, 0);
}

function pirateDensity(
  world: WorldMap,
  sector: NpcSectorService,
  npcs: readonly SectorNpcState[],
  locationId: string,
  excludeId: string
): number {
  const location = world.locations.find((entry) => entry.id === locationId);
  if (!location) return 0;
  return npcs
    .filter((npc) => npc.pirate && npc.id !== excludeId && npc.hullHp > 0)
    .reduce(
      (sum, npc) =>
        sum + (distance(sector.livePosition(npc), location.position) <= 850 ? 1 : 0),
      0
    );
}

function patrolPressure(
  world: WorldMap,
  sector: NpcSectorService,
  npcs: readonly SectorNpcState[],
  locationId: string
): number {
  const location = world.locations.find((entry) => entry.id === locationId);
  if (!location) return 0;
  return npcs
    .filter((npc) => !npc.pirate && npc.job === 'patrol' && npc.hullHp > 0)
    .reduce(
      (sum, npc) =>
        sum + (distance(sector.livePosition(npc), location.position) <= 950 ? 1 : 0),
      0
    );
}

function chooseHuntZone(
  options: PirateNpcServiceOptions,
  npc: SectorNpcState
): string | null {
  const home = options.world.locations.find(
    (location) => location.id === npc.pirateHomeLocationId
  );
  const candidates = options.world.locations
    .filter(
      (location) =>
        location.id !== npc.locationId &&
        (location.activities.trade ||
          location.activities.dock ||
          location.activities.mine ||
          location.activities.salvage)
    )
    .map((location) => {
      const traffic = locationTraffic(options.world, options.sector, options.npcs, location.id);
      const density = pirateDensity(
        options.world,
        options.sector,
        options.npcs,
        location.id,
        npc.id
      );
      const patrol = patrolPressure(options.world, options.sector, options.npcs, location.id);
      const homeDistance = home ? distance(home.position, location.position) : 1400;
      const jitter =
        (hashText(npc.id + ':' + npc.successfulRuns + ':' + location.id) % 1000) / 1000;
      const score =
        location.dangerLevel * 1.35 +
        traffic * 2.5 +
        (location.activities.trade ? 0.8 : 0) +
        Math.max(0, 1.5 - homeDistance / 2400) +
        jitter * 1.8 -
        density * 3.4 -
        patrol * 0.9;
      return { id: location.id, score };
    })
    .sort((first, second) => second.score - first.score);

  const top = candidates.slice(0, Math.min(3, candidates.length));
  if (top.length === 0) return null;
  const pick = hashText(npc.id + ':hunt:' + npc.successfulRuns) % top.length;
  return top[pick]?.id ?? top[0]?.id ?? null;
}

function chooseNearbyPrey(
  options: PirateNpcServiceOptions,
  npc: SectorNpcState
): SectorNpcState | null {
  const here = options.sector.livePosition(npc);
  return (
    options.npcs
      .filter(eligiblePrey)
      .map((candidate) => ({
        candidate,
        range: distance(here, options.sector.livePosition(candidate)),
      }))
      .filter((entry) => entry.range <= 1150)
      .sort((first, second) => first.range - second.range)[0]?.candidate ?? null
  );
}

export function createPirateNpcService(options: PirateNpcServiceOptions): PirateNpcService {
  let decisionAccumulator = 0;
  let elapsedSeconds = 0;
  let respawnSerial = 0;
  const targetPopulation = options.npcs.filter((npc) => npc.pirate).length;
  const pirateTemplates = options.npcs
    .filter((npc) => npc.pirate)
    .map((npc) => structuredClone(npc));
  const respawns: Array<{ dueSeconds: number; templateIndex: number }> = [];

  function maintainPopulation(): void {
    for (let index = options.npcs.length - 1; index >= 0; index -= 1) {
      const npc = options.npcs[index]!;
      if (!npc.pirate || npc.hullHp > 0) continue;
      const templateIndex = Math.max(
        0,
        pirateTemplates.findIndex((template) => template.pirateFaction === npc.pirateFaction)
      );
      respawns.push({
        dueSeconds: elapsedSeconds + 60 + (hashText(npc.id + ':respawn') % 181),
        templateIndex,
      });
      options.npcs.splice(index, 1);
    }

    respawns.sort((first, second) => first.dueSeconds - second.dueSeconds);
    while (
      respawns.length > 0 &&
      respawns[0]!.dueSeconds <= elapsedSeconds &&
      options.npcs.filter((npc) => npc.pirate && npc.hullHp > 0).length < targetPopulation
    ) {
      const job = respawns.shift()!;
      const template =
        pirateTemplates[job.templateIndex % Math.max(1, pirateTemplates.length)] ??
        pirateTemplates[0];
      if (!template) break;
      const fresh = structuredClone(template);
      respawnSerial += 1;
      fresh.id = 'pirate-respawn-' + respawnSerial;
      fresh.cargo = {};
      fresh.hullHp = fresh.hullMaxHp;
      fresh.fuel = fresh.fuelCapacity;
      fresh.locationId = fresh.pirateHomeLocationId ?? fresh.locationId;
      fresh.activityId = 'raiding';
      fresh.activity = 'Auf Beutezug';
      fresh.successfulRuns = 0;
      delete fresh.travel;
      delete fresh.combatMovement;
      fresh.pirateHuntZoneId = undefined;
      fresh.pirateHuntZoneCycles = 0;
      fresh.pirateRaidCooldownSeconds = 5;
      options.npcs.push(fresh);
      options.log(
        'SEKTORMELDUNG > NEUE KORSARENAKTIVITÄT · ' +
          pirateFactionLabel(fresh).toUpperCase()
      );
    }
  }

  function repairOrRaid(npc: SectorNpcState, deltaSeconds: number): boolean {
    if (npc.pirateRaidCooldownSeconds && npc.pirateRaidCooldownSeconds > 0) {
      npc.pirateRaidCooldownSeconds = Math.max(
        0,
        npc.pirateRaidCooldownSeconds - deltaSeconds
      );
    }

    if (
      npc.pirateHomeLocationId &&
      npc.locationId === npc.pirateHomeLocationId &&
      !options.sector.isTravelling(npc) &&
      npc.hullHp > 0 &&
      npc.hullHp < npc.hullMaxHp
    ) {
      npc.activityId = 'repair';
      npc.activity = 'Kampfschäden · Reparatur';
      npc.hullHp = Math.min(npc.hullMaxHp, npc.hullHp + npc.hullMaxHp * 0.012 * deltaSeconds);
      return true;
    }
    return false;
  }

  function decide(npc: SectorNpcState): void {
    if (!npc.pirate || npc.hullHp <= 0 || options.sector.isTravelling(npc)) return;
    if (
      npc.pirateHomeLocationId &&
      npc.locationId === npc.pirateHomeLocationId &&
      npc.hullHp < npc.hullMaxHp
    ) {
      return;
    }

    const hullRatio = npc.hullHp / Math.max(1, npc.hullMaxHp);
    if (hullRatio < 0.45 && npc.pirateHomeLocationId && npc.locationId !== npc.pirateHomeLocationId) {
      if (
        options.sector.requestTravel(
          npc,
          npc.pirateHomeLocationId,
          'Kampfschäden · Rückzug'
        )
      ) {
        options.log(
          'PIRATEN > ' +
            pirateFactionLabel(npc).toUpperCase() +
            ' · ' +
            npc.name.toUpperCase() +
            ' ZIEHT SICH ZURÜCK'
        );
      }
      return;
    }

    const prey = chooseNearbyPrey(options, npc);
    if (prey && (npc.pirateRaidCooldownSeconds ?? 0) <= 0) {
      const destinationId = prey.travel?.finalTargetId ?? prey.locationId;
      if (destinationId !== npc.locationId) {
        options.sector.requestTravel(npc, destinationId, 'Jagd auf Handelsschiff');
      } else {
        npc.activityId = 'raiding';
        npc.activity = 'Auf Beutezug · ' + prey.name;
      }
      return;
    }

    npc.pirateHuntZoneCycles = Math.max(0, (npc.pirateHuntZoneCycles ?? 0) - 1);
    if (!npc.pirateHuntZoneId || (npc.pirateHuntZoneCycles ?? 0) <= 0) {
      npc.pirateHuntZoneId = chooseHuntZone(options, npc) ?? undefined;
      npc.pirateHuntZoneCycles = 2 + (hashText(npc.id + ':' + npc.successfulRuns) % 5);
    }

    if (npc.pirateHuntZoneId && npc.pirateHuntZoneId !== npc.locationId) {
      options.sector.requestTravel(npc, npc.pirateHuntZoneId, 'Revierwechsel · auf Beutezug');
    } else {
      npc.activityId = 'raiding';
      npc.activity = 'Revierpatrouille · auf Beutezug';
    }
  }

  return {
    tick(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const dt = Math.min(deltaSeconds, 0.25);
      elapsedSeconds += dt;
      maintainPopulation();
      for (const npc of options.npcs) {
        if (!npc.pirate) continue;
        repairOrRaid(npc, dt);
      }

      decisionAccumulator += dt;
      if (decisionAccumulator < 3) return;
      decisionAccumulator = 0;
      for (const npc of options.npcs) decide(npc);
    },
  };
}
