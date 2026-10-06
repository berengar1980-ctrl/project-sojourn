export type ShipMineKind = 'ion' | 'shaped_charge' | 'hunter';

export type MineContactLevel = 'hidden' | 'unknown' | 'mine' | 'identified';

export interface ShipIntegrityState {
  readonly shieldHp: number;
  readonly hullHp: number;
}

export interface LayeredDamageResult {
  readonly shieldDamage: number;
  readonly hullDamage: number;
  readonly shieldRemaining: number;
  readonly hullRemaining: number;
}

export interface ShipMineDefinition {
  readonly id: string;
  readonly kind: ShipMineKind;
  readonly name: string;
  readonly tier: number;
  readonly cost: number;
  readonly shieldDamage: number;
  readonly hullDamage: number;
  readonly stealth: number;
  readonly triggerRadiusMeters: number;
  readonly blastRadiusMeters: number;
  readonly pursuitSeconds: number;
  readonly pursuitSpeedMetersPerSecond: number;
}

export interface MineSensorContext {
  readonly crewSkill: number;
  readonly sensorTier: number;
  readonly sensorRangeMeters: number;
  readonly sensorRangeMultiplier: number;
  readonly distanceMeters: number;
}

export interface MineDetectionResult {
  readonly level: MineContactLevel;
  readonly detectionScore: number;
  readonly detectionMargin: number;
  readonly detectionRangeMeters: number;
  readonly confidence: number;
}
