import type { SalvageWreck, SectorSalvageEvent } from '../core/salvage-types';
import type { SystemLogService } from '../core/system-log-types';
import type { SalvageLocalSpaceService } from '../systems/salvage/salvage-local-space-service';

export function requestDistressDiagnosis(
  event: SectorSalvageEvent | null,
  eventId: string,
  wreck: SalvageWreck | undefined,
  service: SalvageLocalSpaceService,
  log: SystemLogService
): void {
  if (
    event?.id !== eventId ||
    event.type !== 'distress-rescue' ||
    event.distressStage !== 'approach' ||
    !wreck
  ) {
    return;
  }
  const before = service.getSnapshot().phase;
  const after = service.startDistressDiagnosis(wreck.id);
  if (before === 'idle' && after.phase !== 'idle') {
    log.write('NOTRUF > ANFLUG ZUR TECHNISCHEN DIAGNOSE');
  }
}

export function tickDistressDiagnosis(
  service: SalvageLocalSpaceService,
  deltaSeconds: number,
  event: SectorSalvageEvent | null,
  onComplete?: (eventId: string) => void
): void {
  const serial = service.getSnapshot().diagnosisSerial;
  service.tick(deltaSeconds);
  if (
    service.getSnapshot().diagnosisSerial !== serial &&
    event?.type === 'distress-rescue' &&
    event.distressStage === 'approach'
  ) {
    onComplete?.(event.id);
  }
}
