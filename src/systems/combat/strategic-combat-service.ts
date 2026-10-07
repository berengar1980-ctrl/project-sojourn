import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';

export type StrategicCombatSide = 'attacker' | 'defender';

export interface StrategicCombatantSetup {
  readonly id: string;
  readonly name: string;
  readonly shipId: string;
  readonly shieldHp: number;
  readonly hullHp: number;
  readonly weapons: readonly ShipComponentDefinition[];
  readonly hitChance: number;
  readonly dodgeChance: number;
  readonly damageMultiplier: number;
  readonly criticalChance: number;
  readonly cycleTimeMultiplier: number;
}

export interface StrategicCombatantSnapshot {
  readonly id: string;
  readonly name: string;
  readonly shipId: string;
  readonly shieldHp: number;
  readonly shieldMaxHp: number;
  readonly hullHp: number;
  readonly hullMaxHp: number;
}

export interface StrategicCombatSnapshot {
  readonly attacker: StrategicCombatantSnapshot;
  readonly defender: StrategicCombatantSnapshot;
  readonly elapsedSeconds: number;
  readonly winner: StrategicCombatSide | null;
  readonly lastEvent: string;
}

export interface StrategicCombatService {
  getSnapshot(): StrategicCombatSnapshot;
  tick(deltaSeconds: number): StrategicCombatSnapshot;
}

interface MutableCombatant {
  readonly setup: StrategicCombatantSetup;
  readonly shieldMaxHp: number;
  readonly hullMaxHp: number;
  readonly cooldowns: number[];
  shieldHp: number;
  hullHp: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function createCombatant(setup: StrategicCombatantSetup): MutableCombatant {
  return {
    setup,
    shieldMaxHp: Math.max(0, setup.shieldHp),
    hullMaxHp: Math.max(1, setup.hullHp),
    shieldHp: Math.max(0, setup.shieldHp),
    hullHp: Math.max(1, setup.hullHp),
    cooldowns: setup.weapons.map(() => 0),
  };
}

function snapshot(combatant: MutableCombatant): StrategicCombatantSnapshot {
  return {
    id: combatant.setup.id,
    name: combatant.setup.name,
    shipId: combatant.setup.shipId,
    shieldHp: combatant.shieldHp,
    shieldMaxHp: combatant.shieldMaxHp,
    hullHp: combatant.hullHp,
    hullMaxHp: combatant.hullMaxHp,
  };
}

function scaledDamage(
  raw: number,
  attacker: MutableCombatant,
  critical: boolean
): number {
  const criticalMultiplier = critical ? 1.5 : 1;
  return Math.max(1, Math.round(raw * attacker.setup.damageMultiplier * criticalMultiplier));
}

function fireWeapon(
  attacker: MutableCombatant,
  defender: MutableCombatant,
  weapon: ShipComponentDefinition,
  random: () => number
): string {
  if (!weapon.weapon) return '';
  const hitChance = clamp(
    attacker.setup.hitChance - defender.setup.dodgeChance,
    0.2,
    0.98
  );
  if (random() > hitChance) return `${attacker.setup.name}: ${weapon.name} verfehlt`;

  const critical = random() < clamp(attacker.setup.criticalChance, 0, 0.5);
  if (defender.shieldHp > 0) {
    const damage = Math.min(
      defender.shieldHp,
      scaledDamage(weapon.weapon.shieldDamage, attacker, critical)
    );
    defender.shieldHp = Math.max(0, defender.shieldHp - damage);
    return `${attacker.setup.name}: ${weapon.name} trifft Schild -${damage}${critical ? ' KRIT' : ''}`;
  }

  const damage = Math.min(
    defender.hullHp,
    scaledDamage(weapon.weapon.hullDamage, attacker, critical)
  );
  defender.hullHp = Math.max(0, defender.hullHp - damage);
  return `${attacker.setup.name}: ${weapon.name} trifft Hülle -${damage}${critical ? ' KRIT' : ''}`;
}

function advanceCombatant(
  attacker: MutableCombatant,
  defender: MutableCombatant,
  deltaSeconds: number,
  random: () => number
): string {
  let lastEvent = '';
  for (let index = 0; index < attacker.setup.weapons.length; index += 1) {
    attacker.cooldowns[index] = Math.max(0, (attacker.cooldowns[index] ?? 0) - deltaSeconds);
    if ((attacker.cooldowns[index] ?? 0) > 0 || defender.hullHp <= 0) continue;

    const weapon = attacker.setup.weapons[index];
    if (!weapon?.weapon) continue;
    lastEvent = fireWeapon(attacker, defender, weapon, random);
    attacker.cooldowns[index] =
      weapon.weapon.cooldownSeconds * clamp(attacker.setup.cycleTimeMultiplier, 0.4, 2);
  }
  return lastEvent;
}

export function createStrategicCombatService(
  attackerSetup: StrategicCombatantSetup,
  defenderSetup: StrategicCombatantSetup,
  seed = hashSeed(attackerSetup.id + ':' + defenderSetup.id)
): StrategicCombatService {
  const attacker = createCombatant(attackerSetup);
  const defender = createCombatant(defenderSetup);
  const random = createRng(seed);
  let elapsedSeconds = 0;
  let winner: StrategicCombatSide | null = null;
  let lastEvent = 'Kampfkontakt hergestellt';

  const current = (): StrategicCombatSnapshot => ({
    attacker: snapshot(attacker),
    defender: snapshot(defender),
    elapsedSeconds,
    winner,
    lastEvent,
  });

  return {
    getSnapshot: current,
    tick(deltaSeconds) {
      if (winner || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current();
      const dt = Math.min(deltaSeconds, 0.25);
      elapsedSeconds += dt;

      const attackerEvent = advanceCombatant(attacker, defender, dt, random);
      if (attackerEvent) lastEvent = attackerEvent;
      if (defender.hullHp <= 0) {
        winner = 'attacker';
        lastEvent = attacker.setup.name + ' gewinnt das Gefecht';
        return current();
      }

      const defenderEvent = advanceCombatant(defender, attacker, dt, random);
      if (defenderEvent) lastEvent = defenderEvent;
      if (attacker.hullHp <= 0) {
        winner = 'defender';
        lastEvent = defender.setup.name + ' gewinnt das Gefecht';
      }
      return current();
    },
  };
}
