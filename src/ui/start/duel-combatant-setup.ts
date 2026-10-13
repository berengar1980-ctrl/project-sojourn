import {
  getShipComponent,
  fitsWeaponHardpoint,
  resolveShipCombatMovementStats,
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

export interface DuelDraft {
  shipId: string;
  weapons: string[];
  mines: string[];
  crewId: string;
}

export function duelCombatant(
  index: number,
  draft: DuelDraft,
  ship: ShipDefinition
): StrategicCombatantSetup {
  const points = ship.sprite.hardpoints;
  const scale = ship.nominalLengthMeters / points.sourceWidth;
  const equipped = draft.weapons.flatMap((id, slotIndex) => {
    const component = getShipComponent('weapon', id);
    return component?.weapon && fitsWeaponHardpoint(ship, slotIndex, component.weapon)
      ? [{ component, slotIndex }]
      : [];
  });
  const mounts = equipped.flatMap((entry, slotIndex) => {
    const mount = points.weaponMounts?.find((point) => point.slotIndex === entry.slotIndex);
    return mount
      ? [
          {
            slotIndex,
            x: (mount.x - points.pivot.x) * scale,
            y: (mount.y - points.pivot.y) * scale,
            facing: mount.facing,
            ...(mount.arcDegrees !== undefined ? { arcDegrees: mount.arcDegrees } : {}),
            ...(mount.allowedMounts ? { allowedMounts: mount.allowedMounts } : {}),
            ...(mount.allowedFamilies ? { allowedFamilies: mount.allowedFamilies } : {}),
          },
        ]
      : [];
  });
  const crew = crewDefinitionById(draft.crewId);
  const pilotSkill = crew?.skills.piloting ?? 50;
  const weaponSkill = crew?.skills.weapons ?? 50;
  const sensorSkill = crew?.skills.sensors ?? 50;
  return {
    id: 'duelist-' + index,
    name: 'Spieler ' + (index + 1) + ' · ' + ship.name,
    shipId: ship.id,
    shieldHp: shipShieldMaxHp(ship),
    shieldGeometry: createCombatShieldGeometry(points, ship.nominalLengthMeters),
    hullHp: shipHullMaxHp(ship),
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
    ...resolveShipCombatMovementStats(ship),
    tractorRangeMeters: (points.tractorBeams?.length ?? 0) > 0 ? 400 : 0,
    aiControlled: true,
    aiAggression: 90,
  };
}
