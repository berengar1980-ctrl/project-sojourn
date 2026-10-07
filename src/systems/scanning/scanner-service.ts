import { sensorContactBaseRange } from '../crew/crew-skill-effects';

export interface ScannerPerformance {
  readonly sensorModifier: number;
  readonly crewSkill: number;
}

const BASE_LONG_RANGE_AT_AUTOMATION = 1080;
const AUTOMATION_SENSOR_SKILL = 20;
const AUTOMATION_VOIDBOUND_RANGE = sensorContactBaseRange(AUTOMATION_SENSOR_SKILL);

export function longRangeScanRadius(performance: ScannerPerformance): number {
  const sensorFactor = Math.max(0.25, performance.sensorModifier);
  const crewFactor =
    sensorContactBaseRange(performance.crewSkill) / Math.max(0.1, AUTOMATION_VOIDBOUND_RANGE);
  return BASE_LONG_RANGE_AT_AUTOMATION * sensorFactor * crewFactor;
}
