import type { WorldPoint } from './world-types';

export type ShieldDamageSource = 'asteroid' | 'laser' | 'missile';

export interface ShieldState {
  readonly maxHp: number;
  readonly modifier: number;
  currentHp: number;
}

export interface ShieldHit {
  readonly source: ShieldDamageSource;
  readonly point: WorldPoint;
  readonly normal: WorldPoint;
  readonly impactEnergy?: number;
  readonly directDamage?: number;
}

export interface ShieldImpactEffect {
  readonly id: number;
  readonly source: ShieldDamageSource;
  readonly point: WorldPoint;
  readonly normal: WorldPoint;
  readonly damage: number;
  readonly strength: number;
  readonly lifetimeSeconds: number;
  ageSeconds: number;
}

export interface ShieldDamageResult {
  readonly damage: number;
  readonly absorbedDamage: number;
  readonly overflowDamage: number;
  readonly impact: ShieldImpactEffect;
}
