import type {
  MineDetectionResult,
  MineSensorContext,
  ShipMineDefinition,
} from '../../core/combat-types';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function mineDetectionScore(context: MineSensorContext): number {
  if (context.sensorTier <= 0 || context.sensorRangeMeters <= 0) return 0;

  const crewSkill = clamp(context.crewSkill, 0, 100);
  const tierBonus = Math.max(0, context.sensorTier - 1) * 5;
  const rangeBonus = Math.max(0, context.sensorRangeMultiplier - 1) * 20;
  return crewSkill + tierBonus + rangeBonus;
}

export function detectShipMine(
  mine: ShipMineDefinition,
  context: MineSensorContext
): MineDetectionResult {
  const detectionScore = mineDetectionScore(context);
  const detectionMargin = detectionScore - mine.stealth;
  const sensorRange = Math.max(0, context.sensorRangeMeters * context.sensorRangeMultiplier);
  const detectionRangeMeters =
    detectionMargin < 0 ? 0 : Math.min(sensorRange, 80 + detectionMargin * 18);
  const visible =
    detectionMargin >= 0 && Math.max(0, context.distanceMeters) <= detectionRangeMeters;

  if (!visible) {
    return {
      level: 'hidden',
      detectionScore,
      detectionMargin,
      detectionRangeMeters,
      confidence: 0,
    };
  }

  const level =
    detectionMargin >= 25 ? 'identified' : detectionMargin >= 10 ? 'mine' : 'unknown';
  return {
    level,
    detectionScore,
    detectionMargin,
    detectionRangeMeters,
    confidence: clamp(0.35 + detectionMargin / 50, 0.35, 1),
  };
}
