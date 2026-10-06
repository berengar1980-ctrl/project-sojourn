import type { PlayerEconomyState } from '../core/economy-types';
import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { WorldLocation } from '../core/world-types';
import { createSalvageSpaceViewModel } from '../features/salvage/salvage-space-view-model';
import type { SalvageEconomyService } from '../systems/economy/salvage-economy-service';
import { createSalvageLocalSpaceService, generateSalvageField } from '../systems/salvage';
import {
  resolveShipRuntimeSetup,
  type ShipComponentInventoryService,
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
  readonly player: PlayerEconomyState;
  readonly componentInventory: ShipComponentInventoryService;
  readonly log: SystemLogService;
  readonly onReturnToStarMap: () => void;
}

export function createSalvageScene(options: SalvageSceneOptions): SalvageSceneController {
  const runtime = resolveShipRuntimeSetup(options.ship);
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
        options.componentInventory.store(
          type,
          componentId,
          sourceWreckId,
          cargoCapacityTons
        ) !== null
      );
    },
    approachSpeed: 85,
  });
  const model = () =>
    createSalvageSpaceViewModel(
      service.getSnapshot(),
      options.ship,
      options.player,
      options.componentInventory.list(),
      options.location.name + ' // Bergung'
    );

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
      refresh();
    },
    destroy() {
      panel?.destroy();
      panel = null;
    },
  };
}
