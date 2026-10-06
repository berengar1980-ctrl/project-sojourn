import type { PlayerEconomyState } from '../core/economy-types';
import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { WorldLocation } from '../core/world-types';
import { createSalvageSpaceViewModel } from '../features/salvage/salvage-space-view-model';
import type { SalvageEconomyService } from '../systems/economy/salvage-economy-service';
import type { NpcEconomyService } from '../systems/economy/npc-economy-service';
import type { SectorNpcState } from '../core/npc-types';
import {
  createNpcLocalSalvageService,
  type NpcLocalSalvageService,
} from '../systems/npcs/npc-local-salvage-service';
import { createSalvageLocalSpaceService, generateSalvageField } from '../systems/salvage';
import {
  getShipDefinition,
  resolveShipRuntimeSetup,
  type ShipComponentInventoryService,
  type ShipRuntimeOptions,
} from '../systems/ships';
import { createSalvageSpacePanel, type SalvageSpacePanel } from '../ui/salvage/salvage-space-panel';

export interface SalvageSceneController {
  tick(deltaSeconds: number): void;
  destroy(): void;
}

interface SalvageSceneOptions {
  readonly root: HTMLElement;
  readonly ship: ShipDefinition;
  readonly seed: number;
  readonly location: WorldLocation;
  readonly economy: SalvageEconomyService;
  readonly npcEconomy: NpcEconomyService;
  readonly sectorNpcs: readonly SectorNpcState[];
  readonly player: PlayerEconomyState;
  readonly componentInventory: ShipComponentInventoryService;
  readonly runtimeOptions?: ShipRuntimeOptions;
  readonly log: SystemLogService;
  readonly onReturnToStarMap: () => void;
}

export function createSalvageScene(options: SalvageSceneOptions): SalvageSceneController {
  const runtime = resolveShipRuntimeSetup(options.ship, options.runtimeOptions);
  const field = generateSalvageField(
    options.location.id,
    options.seed,
    options.location.dangerLevel
  );
  const service = createSalvageLocalSpaceService({
    field,
    setup: runtime.salvage,
    crewSkill: runtime.salvageCrewSkill,
    collect: options.economy.recover,
    collectComponent(type, componentId, sourceWreckId, cargoCapacityTons) {
      return (
        options.componentInventory.store(type, componentId, sourceWreckId, cargoCapacityTons) !==
        null
      );
    },
    approachSpeed: 85,
  });
  const npcSalvage: NpcLocalSalvageService = createNpcLocalSalvageService({
    locationId: options.location.id,
    field,
    salvagers: options.sectorNpcs.filter(
      (npc) => npc.job === 'salvager' && npc.workLocationId === options.location.id
    ),
    recover: (npc, resourceId, requested) =>
      options.npcEconomy.salvageLocal(npc, resourceId, requested),
    depart: (npc) => options.npcEconomy.dispatchLoadedWorker(npc),
  });

  const model = () => {
    const npcShips = npcSalvage.ships.flatMap((npc) => {
      const definition = getShipDefinition(npc.shipId);
      if (!definition) return [];
      return [
        {
          id: npc.npcId,
          name: npc.name,
          position: npc.position,
          headingRadians: npc.headingRadians,
          speed: npc.speed,
          phase: npc.phase,
          targetWreckId: npc.targetWreckId,
          salvageActive: npc.salvageActive,
          scanProgress: npc.scanProgress,
          nominalLengthMeters: definition.nominalLengthMeters,
          spriteUrl: definition.sprite.assetUrl,
          spriteAspectRatio: definition.sprite.widthPx / definition.sprite.heightPx,
          hardpoints: definition.sprite.hardpoints,
        },
      ];
    });
    return createSalvageSpaceViewModel(
      service.getSnapshot(),
      options.ship,
      options.player,
      options.componentInventory.list(),
      options.location.name + ' // Bergung',
      npcShips
    );
  };

  let panel: SalvageSpacePanel | null = null;
  const refresh = (): void => panel?.update(model());
  panel = createSalvageSpacePanel({
    root: options.root,
    model: model(),
    log: options.log,
    onSelectWreck(id) {
      service.selectWreck(id);
      refresh();
    },
    onNavigate(target) {
      service.startNavigation(target);
      options.log.write('NAV > PUNKTROUTE IM WRACKFELD');
      refresh();
    },
    onInspect(wreckId) {
      service.startInspect(wreckId);
      options.log.write('BERGUNG > ANFLUG UND WRACKANALYSE');
      refresh();
    },
    onStrip(wreckId, resourceId) {
      service.startStrip(wreckId, resourceId);
      options.log.write('BERGUNG > MATERIALBERGUNG GESTARTET');
      refresh();
    },
    onRecoverComponent(wreckId) {
      service.startComponentRecovery(wreckId);
      options.log.write('BERGUNG > KOMPONENTENEXTRAKTION GESTARTET');
      refresh();
    },
    onEventChoice(choiceId) {
      const result = service.resolveSalvageEvent(choiceId);
      refresh();
      return result;
    },
    onCancel() {
      service.cancelOperation();
      options.log.write('BERGUNG > VORGANG ABGEBROCHEN');
      refresh();
    },
    onReturnToStarMap: options.onReturnToStarMap,
  });
  options.log.write('SALVAGE OPS > ' + options.location.name.toUpperCase());
  if (!runtime.salvage.available) {
    options.log.write('BERGUNG > KEIN EINSATZFÄHIGES BERGUNGSSYSTEM');
  }

  return {
    tick(deltaSeconds) {
      service.tick(deltaSeconds);
      npcSalvage.tick(deltaSeconds);
      refresh();
    },
    destroy() {
      panel?.destroy();
      panel = null;
    },
  };
}
