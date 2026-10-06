import type { NpcInstalledComponents, SectorNpcState } from '../../core/npc-types';
import type { ShipComponentType } from '../../core/ship-types';
import {
  defaultInstalledShipComponents,
  engineSpeedMultiplier,
  getCompatibleShipComponents,
  getShipComponent,
  getShipDefinition,
  resolveShipGameplayStats,
} from '../ships';

const UPGRADE_TYPES: readonly ShipComponentType[] = [
  'reactor',
  'engine',
  'shield',
  'hull',
  'sensor',
  'weapon',
  'cargo',
  'mining',
  'salvage',
];

function mutableInstalled(source: Readonly<Partial<Record<ShipComponentType, readonly string[]>>>): NpcInstalledComponents {
  return Object.fromEntries(
    Object.entries(source).map(([type, ids]) => [type, [...(ids ?? [])]])
  ) as NpcInstalledComponents;
}

export function ensureNpcInstalledComponents(npc: SectorNpcState): NpcInstalledComponents {
  if (npc.installedComponents) return npc.installedComponents;
  const ship = getShipDefinition(npc.shipId);
  npc.installedComponents = ship ? mutableInstalled(defaultInstalledShipComponents(ship)) : {};
  return npc.installedComponents;
}

function nextUpgradeForType(
  npc: SectorNpcState,
  type: ShipComponentType
): { readonly index: number; readonly nextId: string; readonly cost: number } | null {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return null;
  const stats = resolveShipGameplayStats(ship);
  const installed = ensureNpcInstalledComponents(npc);
  const ids = installed[type] ?? [];

  if (ids.length === 0) {
    const first = getCompatibleShipComponents(type, stats.maxComponentTier)
      .filter((component) => component.tier >= 1)
      .sort((a, b) => a.tier - b.tier || a.cost - b.cost)[0];
    return first ? { index: 0, nextId: first.id, cost: first.cost } : null;
  }

  let bestIndex = -1;
  let bestTier = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ids.length; index += 1) {
    const component = getShipComponent(type, ids[index]!);
    const tier = component?.tier ?? 0;
    if (tier < bestTier) {
      bestTier = tier;
      bestIndex = index;
    }
  }
  if (bestIndex < 0 || bestTier >= stats.maxComponentTier) return null;

  const next = getCompatibleShipComponents(type, stats.maxComponentTier)
    .filter((component) => component.tier === bestTier + 1)
    .sort((a, b) => a.cost - b.cost)[0];
  return next ? { index: bestIndex, nextId: next.id, cost: next.cost } : null;
}

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
    if (type === 'weapon') return 4;
    if (type === 'shield') return 3;
    if (type === 'engine') return 2;
  }
  return type === 'reactor' ? 1.5 : 1;
}

export function npcOperationalSpeed(npc: SectorNpcState): number {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return 180;
  const installed = ensureNpcInstalledComponents(npc);
  return Math.max(1, ship.navigation.cruiseSpeed * engineSpeedMultiplier(installed));
}

export function tryNpcComponentUpgrade(npc: SectorNpcState): boolean {
  if (npc.successfulRuns < 8) return false;
  const reserve = 300000;
  const candidates = UPGRADE_TYPES
    .map((type) => {
      const upgrade = nextUpgradeForType(npc, type);
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
      } => candidate !== null && npc.credits >= candidate.cost + reserve
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
  npc.activityId = 'shipyard-upgrade';
  npc.activity = `Werftumbau · ${getShipComponent(selected.type, selected.nextId)?.name ?? selected.nextId}`;
  return true;
}
