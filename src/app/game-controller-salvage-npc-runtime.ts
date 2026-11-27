import type { WreckClaimRegistry } from '../systems/operations/wreck-claim-registry';
import { npcOperationalRoleAllowed } from '../systems/operations/ship-operation-permissions';
import type { SalvageField } from '../core/salvage-types';
import type { ShipDefinition } from '../core/ship-types';
import type { WorldLocation, WorldPoint } from '../core/world-types';
import type { SectorNpcState } from '../core/npc-types';
import { refreshNpcIndex } from '../systems/npcs/npc-sector-types';
import type { SalvageEconomyService } from '../systems/economy/salvage-economy-service';
import type { NpcEconomyService } from '../systems/economy/npc-economy-service';
import {
  createNpcLocalSalvageService,
  type NpcLocalSalvageService,
} from '../systems/npcs/npc-local-salvage-service';
import type { SalvageLocalSpaceService } from '../systems/salvage/salvage-local-space-service';
import { fieldTrafficObstacles } from '../systems/navigation/field-traffic-obstacles';
import {
  bindLiveFieldShips,
  collectLiveFieldShips,
  type FieldTrafficSource,
} from './game-controller-field-traffic';

interface SalvageNpcRuntimeOptions {
  readonly location: WorldLocation;
  readonly spawnPositions?: ReadonlyMap<string, WorldPoint>;
  readonly sectorNpcs: readonly SectorNpcState[];
  readonly npcEconomy: NpcEconomyService;
  readonly economy?: SalvageEconomyService;
  readonly ship?: ShipDefinition;
  readonly isCombatActive?: () => boolean;
  readonly wreckClaims: WreckClaimRegistry;
  readonly getCurrentDay: () => number;
}

interface SharedSalvageRuntime {
  readonly runtime: NpcLocalSalvageService;
  readonly binding: {
    player:
      { ship: ShipDefinition; service: SalvageLocalSpaceService; fixed: () => boolean } | undefined;
    sceneTraffic: FieldTrafficSource | undefined;
    backgroundTraffic: FieldTrafficSource | undefined;
  };
}

const runtimes = new WeakMap<SalvageField, SharedSalvageRuntime>();

export function hasNpcSalvageRuntime(field: SalvageField): boolean {
  return runtimes.has(field);
}

export function detachNpcSalvagePlayer(field: SalvageField): void {
  const entry = runtimes.get(field);
  if (!entry) return;
  entry.binding.player = undefined;
  entry.binding.sceneTraffic = undefined;
}

/** Scene sources override background sources only while the scene owns the player. */
export function bindSalvageArmedTraffic(
  field: SalvageField,
  source: FieldTrafficSource,
  scene = false
): void {
  const binding = runtimes.get(field)?.binding;
  if (!binding) return;
  if (scene) binding.sceneTraffic = source;
  else binding.backgroundTraffic = source;
}

/** Reuse worker positions, targets and timers across scene entry and exit. */
export function createNpcSalvageRuntime(
  options: SalvageNpcRuntimeOptions,
  field: SalvageField,
  service?: SalvageLocalSpaceService
): NpcLocalSalvageService {
  const existing = runtimes.get(field);
  const player =
    service && options.ship
      ? { ship: options.ship, service, fixed: () => Boolean(options.isCombatActive?.()) }
      : undefined;
  if (existing) {
    if (player) existing.binding.player = player;
    return existing.runtime;
  }
  const binding: SharedSalvageRuntime['binding'] = {
    player,
    sceneTraffic: undefined,
    backgroundTraffic: undefined,
  };
  const runtime = createNpcLocalSalvageService({
    locationId: options.location.id,
    field,
    getTrafficObstacles: (id) => fieldTrafficObstacles(field, id),
    initialPosition: (id) => options.spawnPositions?.get(id),
    initialWorkers: options.wreckClaims.workerCheckpoint(field),
    onWreckEventResolved: (wreck, result) =>
      options.economy?.reconcileWreckEvent?.(field, wreck, result) ?? result,
    get salvagers() {
      return options.sectorNpcs.filter(
        (npc) =>
          npcOperationalRoleAllowed(npc, 'salvage') && npc.workLocationId === options.location.id
      );
    },
    canWorkWreck: (npc, wreck) => {
      if (wreck.boardingHostiles && !wreck.boardingCleared) return false;
      const claim = options.wreckClaims.claim(field.id, wreck.id, options.getCurrentDay());
      return !claim || claim.ownerId === npc.id;
    },
    registerWreck: (npc, wreck) => {
      if (wreck.combatWreckVariant) return true;
      const claim = options.wreckClaims.claim(field.id, wreck.id, options.getCurrentDay());
      if (claim) return claim.ownerId === npc.id;
      const result = options.wreckClaims.register(
        field,
        wreck,
        npc.id,
        options.getCurrentDay(),
        npc.credits
      );
      if (!result.ok) return false;
      npc.credits -= result.fee;
      return true;
    },
    recover: (npc, resourceId, requested, sourceId) =>
      options.npcEconomy.salvageLocal(npc, resourceId, requested, sourceId),
    depart: (npc) => options.npcEconomy.dispatchLoadedWorker(npc),
    get playerShip() {
      return binding.player?.ship;
    },
    getPlayerShipState: () => binding.player?.service.getSnapshot().ship,
    onPlayerShieldContact: (normal, overlap) =>
      binding.player?.service.recordShipShieldContact(normal, overlap),
  });
  runtimes.set(field, { runtime, binding });
  const index = new Map<string, SectorNpcState>();
  bindLiveFieldShips(field, () => {
    const byId = refreshNpcIndex(options.sectorNpcs, index);
    const activePlayer = binding.player;
    return collectLiveFieldShips(
      field.sourceLocationId,
      byId,
      (add) => {
        for (const ship of runtime.ships) add(ship.npcId, ship);
        (binding.sceneTraffic ?? binding.backgroundTraffic)?.(add);
      },
      activePlayer
        ? {
            ship: activePlayer.ship,
            pose: activePlayer.service.getSnapshot().ship,
            fixed: activePlayer.fixed(),
          }
        : undefined,
      field
    );
  });
  return runtime;
}
