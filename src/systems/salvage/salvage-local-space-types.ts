import type { ShipHardpoints } from '../../core/ship-types';
import type { SalvageEventResolution, SalvageLocalSpaceSnapshot, SalvageWreck } from '../../core/salvage-types';
import type { EconomyResourceId } from '../../core/economy-types';
import type { WorldPoint } from '../../core/world-types';
import type { ShipSalvageSetup } from '../ships/ship-salvage-capability';
import type { SalvageComponentCollector, SalvageResourceCollector } from './salvage-field-service';

export interface SalvageLocalSpaceService {
  getSnapshot(): SalvageLocalSpaceSnapshot;
  selectWreck(wreckId: string | null): SalvageLocalSpaceSnapshot;
  startLongRangeScan(): SalvageLocalSpaceSnapshot;
  recordShipShieldContact(normal: WorldPoint, overlap: number): void;
  startNavigation(target: WorldPoint): SalvageLocalSpaceSnapshot;
  startInspect(wreckId: string): SalvageLocalSpaceSnapshot;
  startDistressDiagnosis(wreckId: string): SalvageLocalSpaceSnapshot;
  startStrip(wreckId: string, resourceId: EconomyResourceId): SalvageLocalSpaceSnapshot;
  startComponentRecovery(wreckId: string): SalvageLocalSpaceSnapshot;
  resolveSalvageEvent(choiceId: string): SalvageLocalSpaceSnapshot['lastEventResolution'];
  cancelOperation(): SalvageLocalSpaceSnapshot;
  syncCombatPose(
    position: WorldPoint,
    headingRadians: number,
    speed: number
  ): SalvageLocalSpaceSnapshot;
  tick(deltaSeconds: number, combatOwnsBodies?: boolean): SalvageLocalSpaceSnapshot;
}

export interface SalvageRuntimeOptions {
  readonly field: SalvageLocalSpaceSnapshot['field'];
  readonly setup: ShipSalvageSetup;
  readonly crewSkill: number;
  readonly collect: SalvageResourceCollector;
  readonly onWreckEventResolved?: (
    wreck: SalvageWreck,
    result: SalvageEventResolution
  ) => SalvageEventResolution;
  readonly collectComponent?: SalvageComponentCollector;
  readonly approachSpeed: number;
  readonly turnRateMultiplier?: number;
  readonly hardpoints?: ShipHardpoints;
  readonly shipLengthMeters?: number;
  readonly scanAvailable?: boolean;
  readonly sensorModifier?: number;
  readonly sensorCrewSkill?: number;
}

