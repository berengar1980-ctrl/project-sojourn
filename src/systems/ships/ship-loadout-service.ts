import type { ShipComponentType, ShipDefinition, ShipWeaponProfile } from '../../core/ship-types';
import type { InstalledShipComponents } from './ship-component-service';
import { getShipComponent } from './ship-component-service';
import { defaultInstalledShipComponents } from './ship-mining-capability';
import { resolveShipGameplayStats } from './ship-stats';

export type ShipLoadoutSnapshot = Readonly<Record<string, InstalledShipComponents>>;

export interface ShipLoadoutService {
  snapshot(): ShipLoadoutSnapshot;
  get(ship: ShipDefinition): InstalledShipComponents;
  setSlot(
    ship: ShipDefinition,
    type: ShipComponentType,
    index: number,
    componentId: string | null
  ): boolean;
}

function cloneInstalled(installed: InstalledShipComponents): InstalledShipComponents {
  const copy: Partial<Record<ShipComponentType, readonly string[]>> = {};
  for (const [type, ids] of Object.entries(installed)) {
    copy[type as ShipComponentType] = [...(ids ?? [])];
  }
  return copy;
}

function fitsWeaponHardpoint(
  ship: ShipDefinition,
  index: number,
  weapon: ShipWeaponProfile
): boolean {
  const mounts = ship.sprite.hardpoints.weaponMounts;
  if (!mounts?.length) return true;
  const point = mounts.find((mount) => mount.slotIndex === index);
  if (!point) return false;
  return !point.allowedMounts || point.allowedMounts.includes(weapon.mount ?? 'turret');
}

function slotLimit(ship: ShipDefinition, type: ShipComponentType): number {
  if (type === 'weapon') return ship.sprite.hardpoints.weaponMounts?.length ?? resolveShipGameplayStats(ship).weaponSlots;
  if (type === 'mine' || type === 'tractor') return 1;
  if (type === 'mining') return ship.role === 'mining' ? 1 : 0;
  if (type === 'salvage') return ship.role === 'salvage' ? 1 : 0;
  return 1;
}

export function createShipLoadoutService(): ShipLoadoutService {
  const byShipId = new Map<string, InstalledShipComponents>();

  function get(ship: ShipDefinition): InstalledShipComponents {
    const existing = byShipId.get(ship.id);
    if (existing) return existing;
    const created = cloneInstalled(defaultInstalledShipComponents(ship));
    byShipId.set(ship.id, created);
    return created;
  }

  return {
    get,
    snapshot() {
      return Object.fromEntries(
        [...byShipId].map(([id, installed]) => [id, cloneInstalled(installed)])
      );
    },
    setSlot(ship, type, index, componentId) {
      const limit = slotLimit(ship, type);
      if (index < 0 || index >= limit) return false;

      if (componentId) {
        const component = getShipComponent(type, componentId);
        if (!component || component.tier > resolveShipGameplayStats(ship).maxComponentTier) {
          return false;
        }
        if (type === 'weapon' && (!component.weapon || !fitsWeaponHardpoint(ship, index, component.weapon))) {
          return false;
        }
      }

      const current = cloneInstalled(get(ship));
      const slots = [...(current[type] ?? [])];
      while (slots.length < limit) slots.push('');
      slots[index] = componentId ?? '';
      const next: Partial<Record<ShipComponentType, readonly string[]>> = { ...current };
      next[type] = slots.slice(0, limit);
      byShipId.set(ship.id, next);
      return true;
    },
  };
}
