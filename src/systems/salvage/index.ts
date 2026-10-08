export { generateSalvageField } from './salvage-field-generator';
export { createSalvageEventController } from './salvage-event-service';
export { createSalvageFieldService } from './salvage-field-service';
export { createSalvageLocalSpaceService } from './salvage-local-space-service';
export type { SalvageFieldService, SalvageResourceCollector } from './salvage-field-service';

export type { SalvageLocalSpaceService } from './salvage-local-space-service';

export { generateSectorSalvageEventField } from './salvage-event-field-generator';
export {
  createSectorSalvageEventService,
  MAX_ACTIVE_DISTRESS_EVENTS,
  MAX_ACTIVE_SALVAGE_EVENTS,
} from './sector-salvage-event-service';
export type { SectorSalvageEventService } from './sector-salvage-event-service';
