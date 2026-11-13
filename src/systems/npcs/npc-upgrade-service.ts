import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';
import type { NpcInstalledComponents, SectorNpcState } from '../../core/npc-types';
import type { ShipComponentType } from '../../core/ship-types';
import { repairCost, FUEL_PRICE_PER_UNIT } from '../ships/ship-operating-costs';
import { npcCanInvestAfterMaintenance } from '../economy/npc-operating-decisions';
import {
  defaultInstalledShipComponents,
  engineSpeedMultiplier,
  getCompatibleShipComponents,
  getShipComponent,
  getShipDefinition,
  fitsWeaponHardpoint,
  resolveShipGameplayStats,
  isShipCombatWeaponSlotActive,
  shipPurchasePrice,
} from '../ships';

const UPGRADE_TYPES: readonly ShipComponentType[] = [
  'reactor',
  'engine',
  'shield',
  'hull',
  'armor',
  'sensor',
  'weapon',
  'mine',
  'cargo',
  'mining',
  'salvage',
  'tractor',
];

function mutableInstalled(
  source: Readonly<Partial<Record<ShipComponentType, readonly string[]>>>
): NpcInstalledComponents {
  return Object.fromEntries(
    Object.entries(source).map(([type, ids]) => [type, [...(ids ?? [])]])
  ) as NpcInstalledComponents;
}

/** Pirate hulls have tangible tier-specific, hardpoint-compatible equipment at spawn. */
function pirateFactoryLoadout(npc: SectorNpcState): NpcInstalledComponents {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return {};
  const equipment = mutableInstalled(defaultInstalledShipComponents(ship));
  const cls = npc.pirateClass ?? 'raider';
  const tier = cls === 'marauder' ? 4 : cls === 'reaver' ? 2 : 1;
  const mounts = cls === 'marauder' ? [0, 1, 2, 3] : cls === 'reaver' ? [0, 1, 3] : [0, 3];
  const weapons = [...(equipment.weapon ?? [])];
  for (const index of mounts) {
    const chosen = getCompatibleShipComponents('weapon', tier)
      .filter((candidate) =>
        candidate.tier === tier &&
        Boolean(candidate.weapon && fitsWeaponHardpoint(ship, index, candidate.weapon))
      )
      .sort((a, b) => a.cost - b.cost)[0];
    if (chosen) weapons[index] = chosen.id;
  }
  equipment.weapon = weapons;
  equipment.reactor = [cls === 'marauder' ? 'reactor4' : cls === 'reaver' ? 'reactor3' : 'reactor2'];
  equipment.shield = [cls === 'marauder' ? 'shield4' : cls === 'reaver' ? 'shield2' : 'shield1'];
  equipment.engine = [cls === 'marauder' ? 'engine3' : cls === 'reaver' ? 'engine2' : 'engine1'];
  equipment.sensor = [cls === 'marauder' ? 'sensor3' : cls === 'reaver' ? 'sensor2' : 'sensor1'];
  return equipment;
}

export function ensureNpcInstalledComponents(npc: SectorNpcState): NpcInstalledComponents {
  const ship = getShipDefinition(npc.shipId);
  if (npc.installedComponents) {
    // Legacy NPC saves created before directional mounts equipped weapon1 into
    // the incompatible bow slot. Heal pirates with NO usable guns, while
    // keeping intentional choices and functioning equipped guns intact.
    if (ship && (npc.job === 'pirate' || npc.pirate)) {
      const installed = npc.installedComponents.weapon ?? [];
      const armed = installed.some((id, index) => {
        const component = getShipComponent('weapon', id);
        return Boolean(component?.weapon && fitsWeaponHardpoint(ship, index, component.weapon));
      });
      if (!armed) {
        npc.installedComponents.weapon = [...(defaultInstalledShipComponents(ship).weapon ?? [])];
      }
    }
    return npc.installedComponents;
  }
  npc.installedComponents = npc.pirateClass
    ? pirateFactoryLoadout(npc)
    : ship ? mutableInstalled(defaultInstalledShipComponents(ship)) : {};
  return npc.installedComponents;
}

function nextUpgradeForType(
  npc: SectorNpcState,
  type: ShipComponentType,
  extraComponents: readonly (ShipComponentDefinition | null)[] = []
): { readonly index: number; readonly nextId: string; readonly cost: number } | null {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return null;
  const stats = resolveShipGameplayStats(ship);
  const installed = ensureNpcInstalledComponents(npc);
  const ids = installed[type] ?? [];
  const fitsSlot = (component: ShipComponentDefinition, index: number): boolean =>
    type !== 'weapon' ||
    Boolean(component.weapon && fitsWeaponHardpoint(ship, index, component.weapon));
  const maxTier = type === 'armor' ? 6 : stats.maxComponentTier;
  const compatible = [
    ...getCompatibleShipComponents(type, maxTier),
    ...extraComponents.filter(
      (component): component is ShipComponentDefinition =>
        component !== null && component.type === type && component.tier <= maxTier
    ),
  ];

  if (ids.length === 0) {
    const first = compatible
      .filter((component) => component.tier >= 1 && fitsSlot(component, 0))
      .sort((a, b) => a.tier - b.tier || a.cost - b.cost)[0];
    return first ? { index: 0, nextId: first.id, cost: first.cost } : null;
  }

  let bestIndex = -1;
  let bestTier = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ids.length; index += 1) {
    if (type === 'weapon' && !isShipCombatWeaponSlotActive(ship, index)) continue;
    const component = getShipComponent(type, ids[index]!);
    const tier = component?.tier ?? 0;
    if (tier < bestTier) {
      bestTier = tier;
      bestIndex = index;
    }
  }
  if (bestIndex < 0) return null;
  const current = getShipComponent(type, ids[bestIndex]!);
  const sameTierVariant = compatible
    .filter(
      (component) =>
        component.tier === bestTier &&
        fitsSlot(component, bestIndex) &&
        component.shipyardVariant &&
        component.id !== current?.id &&
        (current?.salvageModifierPct ?? 0) < (component.salvageModifierPct ?? 0)
    )
    .sort(
      (a, b) => (b.salvageModifierPct ?? 0) - (a.salvageModifierPct ?? 0) || a.cost - b.cost
    )[0];
  if (sameTierVariant) {
    return { index: bestIndex, nextId: sameTierVariant.id, cost: sameTierVariant.cost };
  }
  if (bestTier >= maxTier) return null;

  const next = compatible
    .filter((component) => component.tier === bestTier + 1 && fitsSlot(component, bestIndex))
    .sort((a, b) => a.cost - b.cost)[0];
  return next ? { index: bestIndex, nextId: next.id, cost: next.cost } : null;
}

const FALLBACK_UPGRADE_PRIORITY: Readonly<Partial<Record<ShipComponentType, number>>> = {
  reactor: 1.5,
  armor: 1.8,
};

function rolePriority(npc: SectorNpcState, type: ShipComponentType): number {
  if (npc.job === 'freighter') {
    if (type === 'cargo') return 4;
    if (type === 'engine') return 3;
    if (type === 'sensor') return 2;
  } else if (npc.job === 'miner') {
    if (type === 'mining') return 4;
    if (type === 'cargo') return 3;
    if (type === 'engine') return 2;
  } else if (npc.job === 'salvager') {
    if (type === 'salvage') return 4;
    if (type === 'sensor') return 3;
    if (type === 'engine') return 2;
  } else if (npc.job === 'patrol') {
    if (type === 'tractor') return 3.5;
    if (type === 'weapon') return 4;
    if (type === 'mine') return 2;
    if (type === 'shield') return 3;
    if (type === 'engine') return 2;
  }
  return FALLBACK_UPGRADE_PRIORITY[type] ?? 1;
}

export function npcOperationalSpeed(npc: SectorNpcState): number {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return 180;
  const installed = ensureNpcInstalledComponents(npc);
  return Math.max(1, ship.navigation.cruiseSpeed * engineSpeedMultiplier(installed));
}

export function tryNpcComponentUpgrade(
  npc: SectorNpcState,
  variantsForType?: (type: ShipComponentType, maxTier: number) => readonly ShipComponentDefinition[]
): boolean {
  const lastUpgradeRun = npc.lastComponentUpgradeRun ?? 0;
  if (npc.successfulRuns < 8 || npc.successfulRuns - lastUpgradeRun < 8) return false;
  const reserve = 300000;
  const maintenance = repairCost(npc.hullMaxHp - npc.hullHp, true);
  const fuelReserve = Math.ceil((npc.fuelCapacity - npc.fuel) * FUEL_PRICE_PER_UNIT);
  const candidates = UPGRADE_TYPES.map((type) => {
    const ship = getShipDefinition(npc.shipId);
    const maxTier = ship ? resolveShipGameplayStats(ship).maxComponentTier : 1;
    const upgrade = nextUpgradeForType(npc, type, variantsForType?.(type, maxTier) ?? []);
    return upgrade ? { type, ...upgrade, priority: rolePriority(npc, type) } : null;
  })
    .filter(
      (
        candidate
      ): candidate is {
        readonly type: ShipComponentType;
        readonly index: number;
        readonly nextId: string;
        readonly cost: number;
        readonly priority: number;
      } =>
        candidate !== null &&
        npcCanInvestAfterMaintenance(
          npc.credits - reserve,
          candidate.cost,
          maintenance,
          fuelReserve
        )
    )
    .sort((a, b) => b.priority - a.priority || a.cost - b.cost);

  const selected = candidates[0];
  if (!selected) return false;
  const installed = ensureNpcInstalledComponents(npc);
  const ids = [...(installed[selected.type] ?? [])];
  ids[selected.index] = selected.nextId;
  installed[selected.type] = ids;
  npc.credits -= selected.cost;
  npc.componentUpgradeCount = (npc.componentUpgradeCount ?? 0) + 1;
  npc.lastComponentUpgradeRun = npc.successfulRuns;
  npc.activityId = 'shipyard-upgrade';
  npc.activity = `Werftumbau · ${getShipComponent(selected.type, selected.nextId)?.name ?? selected.nextId}`;
  return true;
}

/**
 * Hull progression is an actual purchase at a shipyard, not a free stat multiplier.
 * Keep identity, cargo and location; re-equip the new hull's compatible factory loadout.
 */
export function tryNpcHullUpgrade(npc: SectorNpcState): boolean {
  if (npc.pirate || npc.job === 'patrol' || npc.retiredUntilDay !== undefined) return false;
  if (npc.hullUpgradeCount || npc.successfulRuns < 12) return false;
  const targetId =
    npc.job === 'freighter'
      ? 'freighter-120m-mk4'
      : npc.job === 'miner'
        ? 'miner-80m-mk4'
        : 'salvage-100m-mk4';
  const ship = getShipDefinition(targetId);
  if (!ship || npc.shipId === ship.id) return false;
  const price = shipPurchasePrice(ship);
  const reserve = 350000 + repairCost(npc.hullMaxHp - npc.hullHp, true);
  const fuelReserve = Math.ceil((npc.fuelCapacity - npc.fuel) * FUEL_PRICE_PER_UNIT);
  if (price <= 0 || npc.credits < price + reserve + fuelReserve) return false;
  const capacityUsed = Object.values(npc.cargo).reduce((sum, units) => sum + Math.max(0, units), 0);
  if (capacityUsed > ship.cargoCapacityTons) return false;
  const stats = resolveShipGameplayStats(ship);
  const priorHull = npc.hullMaxHp > 0 ? npc.hullHp / npc.hullMaxHp : 1;
  const priorFuel = npc.fuelCapacity > 0 ? npc.fuel / npc.fuelCapacity : 1;
  npc.credits -= price;
  npc.shipId = ship.id;
  npc.cargoCapacity = ship.cargoCapacityTons;
  npc.normalCargoCapacity =
    npc.job === 'miner' || npc.job === 'salvager'
      ? Math.max(20, Math.round(ship.cargoCapacityTons * 0.35))
      : ship.cargoCapacityTons;
  npc.hullMaxHp = stats.hullPoints;
  npc.hullHp = Math.max(1, Math.round(stats.hullPoints * priorHull));
  npc.fuelCapacity = stats.fuelCapacity;
  npc.fuel = Math.max(0, stats.fuelCapacity * priorFuel);
  npc.fuelUse = stats.fuelUse;
  npc.installedComponents = mutableInstalled(defaultInstalledShipComponents(ship));
  npc.hullUpgradeCount = (npc.hullUpgradeCount ?? 0) + 1;
  npc.lastHullUpgradeRun = npc.successfulRuns;
  npc.activityId = 'shipyard-upgrade';
  npc.activity = 'Neue Rumpfklasse · ' + ship.name;
  return true;
}
