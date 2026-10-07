import type { WorldPoint } from '../../core/world-types';
import {
  sensorCivilianTransponderRange,
  sensorContactBaseRange,
  sensorPirateDetectionRange,
  sensorPirateIdentificationRange,
} from '../crew/crew-skill-effects';

export const SECTOR_UNITS_PER_VOIDBOUND_AU = 100;

export interface SectorSensorContactOptions {
  readonly playerPosition: WorldPoint;
  readonly targetPosition: WorldPoint;
  readonly sensorSkill: number;
  readonly sensorModifier?: number;
  readonly civilianTransponder?: boolean;
  readonly pirate?: boolean;
}

export interface SectorSensorContactInfo {
  readonly visible: boolean;
  readonly identified: boolean;
  readonly distance: number;
  readonly range: number;
  readonly identifyRange: number;
  readonly source: 'transponder' | 'sensor';
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function worldRange(voidboundAu: number, modifier: number): number {
  return Math.max(0, voidboundAu) * SECTOR_UNITS_PER_VOIDBOUND_AU * Math.max(0, modifier);
}

export function sectorSensorContactInfo(
  options: SectorSensorContactOptions
): SectorSensorContactInfo {
  const modifier = Math.max(0, options.sensorModifier ?? 1);
  const pirate = options.pirate ?? false;
  const transponder = (options.civilianTransponder ?? !pirate) && !pirate;
  const targetDistance = distance(options.playerPosition, options.targetPosition);

  const tacticalBaseRange = worldRange(sensorContactBaseRange(options.sensorSkill), modifier);
  const range = transponder
    ? worldRange(sensorCivilianTransponderRange(options.sensorSkill), modifier)
    : pirate
      ? worldRange(sensorPirateDetectionRange(options.sensorSkill), modifier)
      : tacticalBaseRange;
  const identifyRange = pirate
    ? worldRange(sensorPirateIdentificationRange(options.sensorSkill), modifier)
    : range;
  const visible = targetDistance <= range;
  const identified = visible && (!pirate || targetDistance <= identifyRange);

  return {
    visible,
    identified,
    distance: targetDistance,
    range,
    identifyRange,
    source: transponder ? 'transponder' : 'sensor',
  };
}
