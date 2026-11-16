import type {
  StrategicCombatRuntime,
  StrategicCombatantSetup,
} from './strategic-combat-types';
import { cloneCareerJson, type CareerJson } from '../persistence/career-save-contract';

export interface CareerStrategicCombatCheckpoint {
  readonly version: 1;
  readonly seed: number;
  readonly randomCalls: number;
  readonly attackerId: string;
  readonly defenderId: string;
  /** Authoritative physics and cooldowns, not the renderer's visual snapshot. */
  readonly runtime: Readonly<Record<string, CareerJson>>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

function validCombatant(value: unknown, setup: StrategicCombatantSetup): boolean {
  if (!record(value) || 'setup' in value || !record(value.position)) return false;
  if (!record(value.velocity) || !record(value.subsystems)) return false;
  if (!Array.isArray(value.cooldowns) || value.cooldowns.length !== setup.weapons.length) {
    return false;
  }
  return (
    value.cooldowns.every((time) => finite(time)) &&
    finite(value.position.x, -Infinity) &&
    finite(value.position.y, -Infinity) &&
    finite(value.velocity.x, -Infinity) &&
    finite(value.velocity.y, -Infinity) &&
    finite(value.hullHp) &&
    finite(value.shieldHp) &&
    finite(value.hullMaxHp, 1) &&
    finite(value.shieldMaxHp) &&
    value.hullHp <= value.hullMaxHp &&
    value.shieldHp <= value.shieldMaxHp &&
    typeof value.tactic === 'string'
  );
}

function validRuntime(value: Record<string, unknown>): boolean {
  return (
    finite(value.elapsedSeconds) &&
    Array.isArray(value.projectiles) &&
    Array.isArray(value.beams) &&
    Array.isArray(value.mines) &&
    Array.isArray(value.thrownAsteroids) &&
    Array.isArray(value.combatLog) &&
    Array.isArray(value.recentImpacts) &&
    record(value.grappleUsed) &&
    record(value.arena) &&
    finite(value.projectileSerial) &&
    finite(value.beamSerial) &&
    finite(value.mineSerial) &&
    finite(value.impactSerial) &&
    (value.winner === null || value.winner === 'attacker' || value.winner === 'defender') &&
    (value.boardingInitiator === null ||
      value.boardingInitiator === 'attacker' ||
      value.boardingInitiator === 'defender')
  );
}

/** Include RNG progress and every authoritative flight/weapon field. */
export function captureCareerStrategicCombat(
  runtime: StrategicCombatRuntime
): CareerStrategicCombatCheckpoint {
  const { random: _random, attacker, defender, ...rest } = runtime;
  const { setup: _attackerSetup, ...attackerState } = attacker;
  const { setup: _defenderSetup, ...defenderState } = defender;
  const serialized = JSON.parse(JSON.stringify({
    ...rest,
    attacker: attackerState,
    defender: defenderState,
  })) as Record<string, CareerJson>;
  return {
    version: 1,
    seed: runtime.seed,
    randomCalls: runtime.randomCalls,
    attackerId: attacker.setup.id,
    defenderId: defender.setup.id,
    runtime: cloneCareerJson(serialized),
  };
}

export function stageCareerStrategicCombat(
  candidate: unknown,
  attacker: StrategicCombatantSetup,
  defender: StrategicCombatantSetup
): CareerStrategicCombatCheckpoint {
  const saved = cloneCareerJson(candidate);
  if (
    !record(saved) ||
    saved.version !== 1 ||
    !finite(saved.seed) ||
    !Number.isSafeInteger(saved.seed) ||
    !finite(saved.randomCalls) ||
    !Number.isSafeInteger(saved.randomCalls) ||
    saved.randomCalls > 2_000_000 ||
    saved.attackerId !== attacker.id ||
    saved.defenderId !== defender.id ||
    !record(saved.runtime) ||
    !validRuntime(saved.runtime) ||
    !validCombatant(saved.runtime.attacker, attacker) ||
    !validCombatant(saved.runtime.defender, defender)
  ) {
    throw new Error('Invalid or incompatible combat runtime checkpoint');
  }
  return saved as unknown as CareerStrategicCombatCheckpoint;
}
