export interface ScannerPerformance {
  readonly sensorModifier: number;
  readonly crewSkill: number;
}

const BASE_LONG_RANGE = 900;

export function longRangeScanRadius(performance: ScannerPerformance): number {
  const sensorFactor = Math.max(0.25, performance.sensorModifier);
  const crewFactor = 1 + Math.max(0, performance.crewSkill) * 0.01;
  return BASE_LONG_RANGE * sensorFactor * crewFactor;
}
