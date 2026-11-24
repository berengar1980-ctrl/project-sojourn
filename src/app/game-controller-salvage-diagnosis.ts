import type { SalvageWreck, SectorSalvageEvent } from '../core/salvage-types';
import type { SystemLogService } from '../core/system-log-types';
import type { SalvageLocalSpaceService } from '../systems/salvage/salvage-local-space-service';

interface DiagnosisScene {
  readonly field: { readonly wrecks: readonly SalvageWreck[] };
  readonly service: SalvageLocalSpaceService;
  readonly state: { readonly activeSectorEvent: SectorSalvageEvent | null };
  readonly options: {
    readonly log: SystemLogService;
    readonly onDiagnoseDistress?: (eventId: string) => void;
  };
}

export function requestDistressDiagnosis(context: DiagnosisScene, eventId: string): void {
  const { service, state, field, options } = context;
  const event = state.activeSectorEvent;
  if (
    event?.id !== eventId ||
    event.type !== 'distress-rescue' ||
    event.distressStage !== 'approach'
  ) {
    return;
  }
  const wreck = field.wrecks[0];
  if (!wreck) return;
  const before = service.getSnapshot().phase;
  const after = service.startDistressDiagnosis(wreck.id);
  if (before === 'idle' && after.phase !== 'idle') {
    options.log.write('NOTRUF > ANFLUG ZUR TECHNISCHEN DIAGNOSE');
  }
}

export function tickDistressDiagnosis(
  context: DiagnosisScene,
  deltaSeconds: number,
  combatOwnsBodies = false
): void {
  const { service, state, options } = context;
  const serial = service.getSnapshot().diagnosisSerial;
  service.tick(deltaSeconds, combatOwnsBodies);
  const event = state.activeSectorEvent;
  if (
    service.getSnapshot().diagnosisSerial !== serial &&
    event?.type === 'distress-rescue' &&
    event.distressStage === 'approach'
  ) {
    options.onDiagnoseDistress?.(event.id);
  }
}
