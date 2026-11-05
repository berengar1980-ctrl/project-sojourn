import type {
  LocalHullState,
  LocalReactorState,
  LocalSpaceSnapshot,
} from '../../core/local-space-types';
import type { ShieldImpactEffect, ShieldState } from '../../core/shield-types';
import type { ShipHardpoints } from '../../core/ship-types';
import { advanceShieldImpacts, applyShieldHit, createShieldState } from '../shields';
import type { ShieldCollisionImpact } from './local-space-collision';

export interface LocalSpaceSystemsOptions {
  readonly shieldMaxHp: number;
  readonly shieldModifier: number;
  readonly hullMaxHp: number;
  readonly hullCurrentHp?: number;
  readonly scanAvailable: boolean;
  readonly sensorModifier: number;
  readonly sensorCrewSkill: number;
  readonly reactorOutput: number;
  readonly reactorContinuousUsed: number;
  readonly shieldRegenMultiplier?: number;
}

type ShipSystemsSnapshot = Pick<
  LocalSpaceSnapshot,
  'scanAvailable' | 'shield' | 'shieldImpacts' | 'hull' | 'reactor'
>;

export interface LocalSpaceShipSystems {
  readonly scanAvailable: boolean;
  readonly sensorModifier: number;
  readonly sensorCrewSkill: number;
  snapshot(): ShipSystemsSnapshot;
  advance(deltaSeconds: number): void;
  damageHullFraction(fraction: number): number;
  applyCollision(collision: ShieldCollisionImpact): void;
}

function initialHullState(
  options: LocalSpaceSystemsOptions | undefined,
  maxHp: number
): LocalHullState {
  const current = options?.hullCurrentHp ?? maxHp;
  return { maxHp, currentHp: Math.max(0, Math.min(maxHp, current)) };
}

export function createLocalSpaceShipSystems(
  options: LocalSpaceSystemsOptions | undefined,
  hardpoints: ShipHardpoints
): LocalSpaceShipSystems {
  const shield: ShieldState = createShieldState(
    Math.max(1, options?.shieldMaxHp ?? hardpoints.shield.maxHp),
    Math.max(0.01, options?.shieldModifier ?? hardpoints.shield.modifier)
  );
  const hullMaxHp = Math.max(1, options?.hullMaxHp ?? 100);
  const hull = initialHullState(options, hullMaxHp);
  const reactorOutput = Math.max(0, options?.reactorOutput ?? 0);
  const continuousUsed = Math.max(0, options?.reactorContinuousUsed ?? 0);
  const reactor: LocalReactorState = {
    output: reactorOutput,
    continuousUsed,
    continuousFree: reactorOutput - continuousUsed,
  };
  let shieldImpacts: ShieldImpactEffect[] = [];
  let shieldImpactCounter = 0;
  let shieldRegenBlockedSeconds = 0;
  const shieldRegenMultiplier = Math.max(0, options?.shieldRegenMultiplier ?? 1);

  return {
    scanAvailable: options?.scanAvailable ?? true,
    sensorModifier: Math.max(0, options?.sensorModifier ?? 1),
    sensorCrewSkill: Math.max(0, options?.sensorCrewSkill ?? 0),

    snapshot() {
      return {
        scanAvailable: options?.scanAvailable ?? true,
        shield,
        shieldImpacts,
        hull,
        reactor,
      };
    },

    advance(deltaSeconds) {
      const delta = Math.max(0, deltaSeconds);
      shieldImpacts = advanceShieldImpacts(shieldImpacts, delta);
      const blockedBeforeAdvance = shieldRegenBlockedSeconds;
      shieldRegenBlockedSeconds = Math.max(0, blockedBeforeAdvance - delta);
      const regenSeconds = Math.max(0, delta - blockedBeforeAdvance);
      if (regenSeconds > 0 && shield.currentHp < shield.maxHp) {
        shield.currentHp = Math.min(
          shield.maxHp,
          shield.currentHp + 0.4 * shieldRegenMultiplier * regenSeconds
        );
      }
    },

    damageHullFraction(fraction) {
      const damage = Math.min(
        hull.currentHp,
        Math.max(0, Math.round(hull.maxHp * Math.max(0, fraction)))
      );
      hull.currentHp = Math.max(0, hull.currentHp - damage);
      return damage;
    },

    applyCollision(collision) {
      const result = applyShieldHit(
        shield,
        {
          source: 'asteroid',
          point: collision.point,
          normal: collision.normal,
          surfaceAnchor: collision.surfaceAnchor,
          impactEnergy: collision.kineticEnergy,
        },
        shieldImpactCounter
      );
      shieldImpactCounter += 1;
      if (result.damage > 0) {
        shieldImpacts.push(result.impact);
        shieldRegenBlockedSeconds = Math.max(
          shieldRegenBlockedSeconds,
          shield.currentHp <= 0 ? 7 : 3
        );
      }
      if (result.overflowDamage > 0) {
        hull.currentHp = Math.max(0, hull.currentHp - result.overflowDamage);
      }
    },
  };
}
