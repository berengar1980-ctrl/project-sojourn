import {
  combatEquippedWeapons,
  combatWeaponMounts,
} from '../../systems/combat/combat-loadout-mounts';
import {
  resolveShipCombatMovementStats,
  resolveShipArmorProtection,
  componentHullBonus,
  componentShieldBonus,
  calculateShipModeEnergy,
  getShipComponent,
  shipCombatTractorRange,
  shipHasIndustrialTractor,
  shipHullMaxHp,
  shipShieldMaxHp,
  type ShipDefinition,
} from '../../systems/ships';
import { createCombatShieldGeometry, type StrategicCombatantSetup } from '../../systems/combat';
import { crewDefinitionById } from '../../data/crew/crew-definitions';
import {
  pilotingDodgeChance,
  sensorWeaponHitChanceBonus,
  weaponDamageMultiplier,
  weaponCriticalChance,
  weaponCycleTimeMultiplier,
} from '../../systems/crew/crew-skill-effects';
import { SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';

import { campaignCombatPreset, campaignPresetIsDrone } from './campaign-combat-preset';
import { npcCombatant } from '../../systems/combat/npc-combatant-setup';

export interface DuelDraft {
  campaignNpcId?: string;
  shipId: string;
  weapons: string[];
  mines: string[];
  crewId: string;
  engineId?: string;
  armorId?: string;
  reactorId?: string;
  shieldId?: string;
  hullId?: string;
  sensorId?: string;
  tractorId?: string;
  miningId?: string;
  salvageId?: string;
  cargoId?: string;
}

/** A single canonical installed loadout powers both the UI readout and combat. */
export function duelInstalledComponents(draft: DuelDraft) {
  const one = (id: string | undefined): string[] => (id ? [id] : []);
  return {
    reactor: one(draft.reactorId ?? 'reactor1'),
    engine: one(draft.engineId ?? 'engine1'),
    shield: one(draft.shieldId ?? 'shield1'),
    hull: one(draft.hullId ?? 'hull1'),
    armor: one(draft.armorId),
    sensor: one(draft.sensorId ?? 'sensor1'),
    tractor: one(draft.tractorId ?? 'tractor1'),
    mining: one(draft.miningId),
    salvage: one(draft.salvageId),
    cargo: one(draft.cargoId),
    weapon: draft.weapons.filter((id) => !!id),
    mine: draft.mines.filter((id) => !!id),
  };
}

export function duelCombatant(
  index: number,
  draft: DuelDraft,
  ship: ShipDefinition
): StrategicCombatantSetup {
  if (draft.campaignNpcId) {
    const npc = campaignCombatPreset(draft.campaignNpcId);
    const id = (campaignPresetIsDrone(npc) ? 'security-drone:' : '') + 'duelist-' + index;
    const setup = npcCombatant({ ...npc, id });
    if (!setup) throw new Error('Missing campaign combatant: ' + npc.shipId);
    return setup;
  }
  const points = ship.sprite.hardpoints;
  const equipped = combatEquippedWeapons(ship, draft.weapons);
  const mounts = combatWeaponMounts(ship, equipped);
  const crew = crewDefinitionById(draft.crewId);
  const installed = duelInstalledComponents(draft);
  const power = calculateShipModeEnergy(installed);
  const sensor = getShipComponent('sensor', draft.sensorId ?? 'sensor1');
  const armor = resolveShipArmorProtection(installed);
  const pilotSkill = crew?.skills.piloting ?? 50;
  const weaponSkill = crew?.skills.weapons ?? 50;
  const sensorSkill = crew?.skills.sensors ?? 50;
  return {
    id: 'duelist-' + index,
    name: 'Spieler ' + (index + 1) + ' · ' + ship.name,
    shipId: ship.id,
    shieldHp: shipShieldMaxHp(ship) + componentShieldBonus(installed),
    shieldGeometry: createCombatShieldGeometry(points, ship.nominalLengthMeters),
    hullHp: shipHullMaxHp(ship, componentHullBonus(installed)),
    ...(armor ? { armor } : {}),
    weapons: equipped.map((entry) => entry.component),
    mines: draft.mines.flatMap((id) => {
      const mine = SHIP_MINE_CATALOG.find((entry) => entry.id === id);
      return mine ? [mine] : [];
    }),
    weaponMounts: mounts,
    hitChance: 0.68 + sensorWeaponHitChanceBonus(sensorSkill),
    dodgeChance: pilotingDodgeChance(pilotSkill),
    damageMultiplier: weaponDamageMultiplier(weaponSkill),
    criticalChance: weaponCriticalChance(weaponSkill),
    cycleTimeMultiplier: weaponCycleTimeMultiplier(weaponSkill),
    preferredTactic: 'fight',
    ...resolveShipCombatMovementStats(ship, installed),
    tractorRangeMeters: shipCombatTractorRange(installed),
    power,
    sensorTier: sensor?.tier ?? 0,
    sensorCrewSkill: sensorSkill,
    sensorRangeMeters: sensor ? 1000 : 0,
    tractorCanManipulateObjects: shipHasIndustrialTractor(ship),
    aiControlled: true,
    aiAggression: 90,
  };
}
