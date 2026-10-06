import type { PlayerEconomyState } from '../../core/economy-types';
import type { SalvageLocalSpaceSnapshot, SalvageWreckKind } from '../../core/salvage-types';
import type { ShipDefinition, ShipHardpoints } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import { economyResourceById } from '../../data/economy/economy-resources';

export interface SalvageResourceView {
  readonly resourceId: string;
  readonly name: string;
  readonly remaining: number;
  readonly initial: number;
}

export interface SalvageWreckView {
  readonly id: string;
  readonly name: string;
  readonly kind: SalvageWreckKind;
  readonly kindLabel: string;
  readonly position: WorldPoint;
  readonly radius: number;
  readonly rotation: number;
  readonly integrity: number;
  readonly quality: number;
  readonly qualityLabel: string;
  readonly inspected: boolean;
  readonly depleted: boolean;
  readonly componentSignal: boolean;
  readonly resources: readonly SalvageResourceView[];
  readonly isSelected: boolean;
  readonly isWorkTarget: boolean;
}

export interface SalvageShipView {
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly turnRateRadiansPerSecond: number;
  readonly angularThrust: number;
  readonly lateralThrust: number;
  readonly speed: number;
  readonly nominalLengthMeters: number;
  readonly spriteUrl: string;
  readonly spriteAspectRatio: number;
  readonly hardpoints: ShipHardpoints;
}

export interface SalvageCargoView {
  readonly resourceId: string;
  readonly name: string;
  readonly amount: number;
}

export interface SalvageSpaceViewModel {
  readonly title: string;
  readonly backgroundSeed: number;
  readonly width: number;
  readonly height: number;
  readonly ship: SalvageShipView;
  readonly wrecks: readonly SalvageWreckView[];
  readonly selectedWreck: SalvageWreckView | null;
  readonly navigationTarget: WorldPoint | null;
  readonly navigationRoute: readonly WorldPoint[];
  readonly phase: SalvageLocalSpaceSnapshot['phase'];
  readonly operationProgress: number | null;
  readonly activeResourceId: string | null;
  readonly salvageAvailable: boolean;
  readonly cargoCapacityTons: number;
  readonly cargoUsedTons: number;
  readonly cargoResources: readonly SalvageCargoView[];
  readonly lastRecovery: SalvageLocalSpaceSnapshot['lastRecovery'];
  readonly recoverySerial: number;
}

function wreckKindLabel(kind: SalvageWreckKind): string {
  return {
    freighter: 'FRACHTERWRACK',
    miner: 'MINENWRACK',
    salvager: 'BERGUNGSWRACK',
    patrol: 'PATROUILLENWRACK',
  }[kind];
}

function qualityLabel(quality: number): string {
  if (quality >= 3) return 'SEHR GUT';
  if (quality >= 2) return 'GUT';
  return 'MÄSSIG';
}

function cargoView(player: PlayerEconomyState): readonly SalvageCargoView[] {
  return Object.entries(player.cargo)
    .filter(([, lot]) => lot.qty > 0)
    .map(([resourceId, lot]) => ({
      resourceId,
      name: economyResourceById(resourceId)?.name ?? resourceId,
      amount: lot.qty,
    }))
    .sort((first, second) => first.name.localeCompare(second.name));
}

export function createSalvageSpaceViewModel(
  snapshot: SalvageLocalSpaceSnapshot,
  ship: ShipDefinition,
  player: PlayerEconomyState,
  title: string
): SalvageSpaceViewModel {
  const wrecks = snapshot.field.wrecks.map((wreck) => ({
    id: wreck.id,
    name: wreck.name,
    kind: wreck.kind,
    kindLabel: wreckKindLabel(wreck.kind),
    position: wreck.position,
    radius: wreck.radius,
    rotation: wreck.rotation,
    integrity: wreck.integrity,
    quality: wreck.quality,
    qualityLabel: qualityLabel(wreck.quality),
    inspected: wreck.inspected,
    depleted: wreck.resources.every((entry) => entry.remainingAmount <= 0),
    componentSignal: wreck.inspected && wreck.component !== null,
    resources: wreck.inspected
      ? wreck.resources.map((entry) => ({
          resourceId: entry.resourceId,
          name: economyResourceById(entry.resourceId)?.name ?? entry.resourceId,
          remaining: entry.remainingAmount,
          initial: entry.initialAmount,
        }))
      : [],
    isSelected: wreck.id === snapshot.selectedWreckId,
    isWorkTarget: wreck.id === snapshot.workTargetId,
  }));
  const cargoResources = cargoView(player);

  return {
    title,
    backgroundSeed: snapshot.field.seed,
    width: snapshot.field.width,
    height: snapshot.field.height,
    ship: {
      position: snapshot.ship.position,
      headingRadians: snapshot.ship.headingRadians,
      turnRateRadiansPerSecond: snapshot.ship.turnRateRadiansPerSecond,
      angularThrust: snapshot.ship.angularThrust,
      lateralThrust: snapshot.ship.lateralThrust,
      speed: snapshot.ship.speed,
      nominalLengthMeters: ship.nominalLengthMeters,
      spriteUrl: ship.sprite.assetUrl,
      spriteAspectRatio: ship.sprite.widthPx / ship.sprite.heightPx,
      hardpoints: ship.sprite.hardpoints,
    },
    wrecks,
    selectedWreck: wrecks.find((wreck) => wreck.isSelected) ?? null,
    navigationTarget: snapshot.navigationTarget,
    navigationRoute: snapshot.navigationRoute,
    phase: snapshot.phase,
    operationProgress: snapshot.operationProgress,
    activeResourceId: snapshot.activeResourceId,
    salvageAvailable: snapshot.salvageAvailable,
    cargoCapacityTons: snapshot.cargoCapacityTons,
    cargoUsedTons: cargoResources.reduce((sum, entry) => sum + entry.amount, 0),
    cargoResources,
    lastRecovery: snapshot.lastRecovery,
    recoverySerial: snapshot.recoverySerial,
  };
}
