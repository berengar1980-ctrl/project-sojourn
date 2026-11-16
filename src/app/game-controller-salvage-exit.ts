import type { DistressTowState } from '../systems/salvage/distress-tow-physics';
import type { SectorSalvageEvent } from '../core/salvage-types';
import type { SystemLogService } from '../core/system-log-types';
import type { createSalvageLocalSpaceService } from '../systems/salvage';
import { towShipAtExit } from '../systems/salvage/distress-tow-physics';
import { localSpaceExitPoint, playerAtLocalExit } from '../ui/map/local-space-exit-gate';

interface SalvageExitOptions {
  readonly service: ReturnType<typeof createSalvageLocalSpaceService>;
  readonly activeSectorEvent: SectorSalvageEvent | null;
  readonly distressTow: DistressTowState | null;
  readonly log: SystemLogService;
  readonly onReturn: () => void;
  readonly refresh: () => void;
}

export function returnToStarMapFromSalvage(options: SalvageExitOptions): void {
  const snapshot = options.service.getSnapshot();
  const { width, height } = snapshot.field;
  if (!playerAtLocalExit(snapshot.ship.position, width, height, snapshot.field.seed)) {
    options.log.write('NAV > BITTE ZUERST DEN MARKIERTEN AUSGANG ANFLIEGEN');
    options.refresh();
    return;
  }
  if (
    options.activeSectorEvent?.distressStage === 'towing' &&
    (!options.distressTow ||
      !towShipAtExit(
        snapshot.ship.position,
        options.distressTow,
        localSpaceExitPoint(width, height, snapshot.field.seed)
      ))
  ) {
    options.log.write('SCHLEPPEN > HAVARIST MUSS MIT ZUM AUSGANG');
    return;
  }
  options.onReturn();
}
