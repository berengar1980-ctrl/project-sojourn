export interface MiningResourceDefinition {
  readonly id: string;
  readonly name: string;
  readonly rarity: number;
  readonly spawnWeight: number;
  readonly baseValue: number;
}

export type AsteroidScanLevel = 'unscanned' | 'surveyed' | 'analyzed';
