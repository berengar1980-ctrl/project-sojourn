import type { ShipComponentType, ShipDefinition } from '../../core/ship-types';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import {
  calculateShipEnergy,
  createShipyardVariantId,
  getShipComponent,
} from './ship-component-service';
import { isShipCombatWeaponSlotActive } from './ship-combat-role-policy';
import type { ShipLoadoutService } from './ship-loadout-service';
import { resolveShipGameplayStats } from './ship-stats';

const TEST_COMPONENT_TYPES = [
  'engine',
  'shield',
  'hull',
  'armor',
  'sensor',
  'cargo',
  'mine',
  'tractor',
  'mining',
  'salvage',
] as const satisfies readonly ShipComponentType[];

function preferredTierTwo(type: ShipComponentType): string | null {
  const components = SHIP_COMPONENT_CATALOG[type] ?? [];
  const preferred = components.find(
    (component) => component.tier === 2 && (type !== 'armor' || component.id === 'armor-all-2')
  );
  return preferred?.id ?? null;
}

/** The generator is exempt from Mk II because a populated battery needs more power. */
function powerDeveloperTestShip(ship: ShipDefinition, loadouts: ShipLoadoutService): void {
  const reactorTier = resolveShipGameplayStats(ship).maxComponentTier;
  const reactor = (SHIP_COMPONENT_CATALOG.reactor ?? [])
    .filter((component) => component.tier <= reactorTier)
    .at(-1);
  if (!reactor || !loadouts.setSlot(ship, 'reactor', 0, reactor.id)) return;
  const required = calculateShipEnergy(loadouts.get(ship)).combatUsed;
  if ((reactor.output ?? 0) >= required) return;
  const enhanced = createShipyardVariantId('reactor', reactor.id, 'performance', 100);
  if (enhanced && loadouts.canSetSlot(ship, 'reactor', 0, enhanced)) {
    loadouts.setSlot(ship, 'reactor', 0, enhanced);
  }
}

/** Configure only the explicit developer ship switcher; ordinary career hull defaults stay Mk I. */
export function equipDeveloperTestShip(ship: ShipDefinition, loadouts: ShipLoadoutService): void {
  for (const type of TEST_COMPONENT_TYPES) {
    const id = preferredTierTwo(type);
    if (id && loadouts.canSetSlot(ship, type, 0, id)) {
      loadouts.setSlot(ship, type, 0, id);
    }
  }

  const mounts = ship.sprite.hardpoints.weaponMounts ?? [];
  const slotCount = mounts.length || resolveShipGameplayStats(ship).weaponSlots;
  const weapons = (SHIP_COMPONENT_CATALOG.weapon ?? []).filter(
    (component) => component.tier === 2 && component.weapon
  );
  // The railgun is the purpose-built high hull-damage, forward-only Mk III weapon.
  const railgun = getShipComponent('weapon', 'weapon-railgun-3');
  let bowArmed = false;
  for (let index = 0; index < slotCount; index++) {
    if (!isShipCombatWeaponSlotActive(ship, index)) continue;
    if (
      !bowArmed &&
      railgun &&
      loadouts.canSetSlot(ship, 'weapon', index, railgun.id) &&
      mounts.some((mount) => mount.slotIndex === index && mount.allowedMounts?.includes('forward'))
    ) {
      loadouts.setSlot(ship, 'weapon', index, railgun.id);
      bowArmed = true;
      continue;
    }
    const preferred = [
      'pulse_laser',
      'front_repeater',
      'plasma_battery',
      'autocannon',
      'guided_missile',
    ];
    const compatible = weapons
      .filter((component) => loadouts.canSetSlot(ship, 'weapon', index, component.id))
      .sort((a, b) => preferred.indexOf(a.weapon!.family) - preferred.indexOf(b.weapon!.family))[0];
    if (compatible) loadouts.setSlot(ship, 'weapon', index, compatible.id);
  }

  powerDeveloperTestShip(ship, loadouts);
}
