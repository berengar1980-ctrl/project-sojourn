import type { DistressRammingState } from '../../systems/salvage/distress-ramming-physics';
import type { DistressTowState } from '../../systems/salvage/distress-tow-physics';
import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-service';
import type { PlayerEconomyState } from '../../core/economy-types';
import type { ShieldImpactEffect } from '../../core/shield-types';
import type {
  SalvageLocalSpaceSnapshot,
  SalvageContainerVariant,
  SalvageDebris,
  SalvageDebrisVariant,
  SalvageSection,
  SalvageSectionVariant,
  SalvageWreckKind,
  SectorSalvageEvent,
} from '../../core/salvage-types';
import type { LooseShipComponent, ShipDefinition, ShipHardpoints } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import { economyResourceById } from '../../data/economy/economy-resources';
import { getShipComponent } from '../../systems/ships';

export interface SalvageResourceView {
  readonly resourceId: string;
  readonly name: string;
  readonly remaining: number;
  readonly initial: number;
}

export interface SalvageComponentView {
  readonly componentId: string;
  readonly name: string;
  readonly tier: number;
  readonly cargoTons: number;
  readonly chancePercent: number;
  readonly status: 'available' | 'recovered' | 'destroyed';
}

export interface SalvageWreckView {
  readonly id: string;
  readonly name: string;
  readonly kind: SalvageWreckKind;
  readonly kindLabel: string;
  readonly position: WorldPoint;
  readonly radius: number;
  readonly rotation: number;
  readonly containerVariant?: SalvageContainerVariant;
  readonly debrisVariant?: SalvageDebrisVariant;
  readonly sectionVariant?: SalvageSectionVariant;
  readonly effectSeed?: number;
  readonly rotation3d?: Readonly<{ x: number; y: number; z: number }>;
  readonly integrity: number;
  readonly quality: number;
  readonly qualityLabel: string;
  readonly inspected: boolean;
  readonly scanLevel: 'unscanned' | 'surveyed' | 'analyzed';
  readonly depleted: boolean;
  readonly componentSignal: boolean;
  readonly component: SalvageComponentView | null;
  readonly resources: readonly SalvageResourceView[];
  readonly isSelected: boolean;
  readonly isWorkTarget: boolean;
}

export interface SalvageNpcShipView {
  readonly id: string;
  readonly name: string;
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly speed: number;
  readonly phase: 'entering' | 'approaching' | 'scanning' | 'salvaging' | 'exiting';
  readonly targetWreckId: string | null;
  readonly salvageActive: boolean;
  readonly scanProgress: number;
  readonly nominalLengthMeters: number;
  readonly spriteUrl: string;
  readonly spriteAspectRatio: number;
  readonly hardpoints: ShipHardpoints;
  readonly isSelected?: boolean;
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

export interface SalvageLooseComponentView {
  readonly uid: string;
  readonly name: string;
  readonly tier: number;
  readonly cargoTons: number;
}

export interface SalvageSpaceViewModel {
  readonly title: string;
  readonly backgroundSeed: number;
  readonly width: number;
  readonly height: number;
  readonly ship: SalvageShipView;
  readonly shieldImpacts: readonly ShieldImpactEffect[];
  readonly npcShips: readonly SalvageNpcShipView[];
  readonly wrecks: readonly SalvageWreckView[];
  readonly debris: readonly SalvageDebris[];
  readonly sections: readonly SalvageSection[];
  readonly selectedWreck: SalvageWreckView | null;
  readonly navigationTarget: WorldPoint | null;
  readonly navigationRoute: readonly WorldPoint[];
  readonly phase: SalvageLocalSpaceSnapshot['phase'];
  readonly operationProgress: number | null;
  readonly longRangeScanProgress: number | null;
  readonly activeResourceId: string | null;
  readonly salvageAvailable: boolean;
  readonly scanAvailable: boolean;
  readonly cargoCapacityTons: number;
  readonly cargoUsedTons: number;
  readonly cargoResources: readonly SalvageCargoView[];
  readonly looseComponents: readonly SalvageLooseComponentView[];
  readonly lastRecovery: SalvageLocalSpaceSnapshot['lastRecovery'];
  readonly recoverySerial: number;
  readonly lastComponentRecovery: SalvageLocalSpaceSnapshot['lastComponentRecovery'];
  readonly componentRecoverySerial: number;
  readonly salvageEvent: SalvageLocalSpaceSnapshot['salvageEvent'];
  readonly salvageEventRecoverySeconds: number;
  readonly lastEventResolution: SalvageLocalSpaceSnapshot['lastEventResolution'];
  readonly eventResolutionSerial: number;
  readonly combat: StrategicCombatSnapshot | null;
  readonly sectorEvent: SectorSalvageEvent | null;
  readonly distressTow: DistressTowState | null;
  readonly distressRamming: DistressRammingState | null;
  readonly distressRepairing: boolean;
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

function wreckViews(snapshot: SalvageLocalSpaceSnapshot): readonly SalvageWreckView[] {
  return snapshot.field.wrecks.map((wreck): SalvageWreckView => {
    const componentDefinition =
      wreck.component === null
        ? null
        : getShipComponent(wreck.component.type, wreck.component.componentId);
    return {
      id: wreck.id,
      name: wreck.name,
      kind: wreck.kind,
      kindLabel: wreck.sectionVariant
        ? 'SCHIFFSSEKTION'
        : wreck.debrisVariant
          ? 'SCHIFFSFRAGMENT'
          : wreck.containerVariant
            ? {
                standard: 'FRACHTCONTAINER',
                damaged: 'BESCHÄDIGTER CONTAINER',
                tank: 'TANKMODUL',
              }[wreck.containerVariant]
            : wreckKindLabel(wreck.kind),
      position: wreck.position,
      radius: wreck.radius,
      rotation: wreck.rotation,
      ...(wreck.containerVariant ? { containerVariant: wreck.containerVariant } : {}),
      ...(wreck.debrisVariant ? { debrisVariant: wreck.debrisVariant } : {}),
      ...(wreck.sectionVariant ? { sectionVariant: wreck.sectionVariant } : {}),
      ...(wreck.effectSeed !== undefined ? { effectSeed: wreck.effectSeed } : {}),
      ...(wreck.rotation3d ? { rotation3d: wreck.rotation3d } : {}),
      integrity: wreck.integrity,
      quality: wreck.quality,
      qualityLabel: qualityLabel(wreck.quality),
      inspected: wreck.inspected,
      scanLevel: wreck.inspected ? 'analyzed' : (wreck.scanLevel ?? 'unscanned'),
      depleted: wreck.resources.every((entry) => entry.remainingAmount <= 0),
      componentSignal: wreck.inspected && wreck.component !== null,
      component:
        wreck.inspected && wreck.component
          ? {
              componentId: wreck.component.componentId,
              name: componentDefinition?.name ?? wreck.component.componentId,
              tier: componentDefinition?.tier ?? wreck.quality,
              cargoTons: wreck.component.cargoTons,
              chancePercent: snapshot.componentRecoveryChances[wreck.id] ?? 0,
              status:
                wreck.componentStatus === 'recovered' || wreck.componentStatus === 'destroyed'
                  ? wreck.componentStatus
                  : 'available',
            }
          : null,
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
    };
  });
}

function shipView(
  snapshot: SalvageLocalSpaceSnapshot,
  ship: ShipDefinition,
  combat: StrategicCombatSnapshot | null
): SalvageShipView {
  return {
    position: combat?.attacker.position ?? snapshot.ship.position,
    headingRadians: combat?.attacker.headingRadians ?? snapshot.ship.headingRadians,
    turnRateRadiansPerSecond: snapshot.ship.turnRateRadiansPerSecond,
    angularThrust: snapshot.ship.angularThrust,
    lateralThrust: snapshot.ship.lateralThrust,
    speed: combat?.attacker.speed ?? snapshot.ship.speed,
    nominalLengthMeters: ship.nominalLengthMeters,
    spriteUrl: ship.sprite.assetUrl,
    spriteAspectRatio: ship.sprite.widthPx / ship.sprite.heightPx,
    hardpoints: ship.sprite.hardpoints,
  };
}

function npcShipViews(
  npcShips: readonly SalvageNpcShipView[],
  selectedNpcId: string | null,
  combat: StrategicCombatSnapshot | null
): readonly SalvageNpcShipView[] {
  return npcShips.map((npc) => {
    if (combat?.defender.id !== npc.id) {
      return { ...npc, isSelected: npc.id === selectedNpcId };
    }
    return {
      ...npc,
      position: combat.defender.position,
      headingRadians: combat.defender.headingRadians,
      speed: combat.defender.speed,
      isSelected: true,
    };
  });
}

export function createSalvageSpaceViewModel(
  snapshot: SalvageLocalSpaceSnapshot,
  ship: ShipDefinition,
  player: PlayerEconomyState,
  looseComponents: readonly LooseShipComponent[],
  title: string,
  npcShips: readonly SalvageNpcShipView[] = [],
  selectedNpcId: string | null = null,
  combat: StrategicCombatSnapshot | null = null,
  sectorEvent: SectorSalvageEvent | null = null,
  distressTow: DistressTowState | null = null,
  distressRamming: DistressRammingState | null = null,
  distressRepairing = false
): SalvageSpaceViewModel {
  const wrecks = wreckViews(snapshot);
  const cargoResources = cargoView(player);
  return {
    title,
    backgroundSeed: snapshot.field.seed,
    width: snapshot.field.width,
    height: snapshot.field.height,
    ship: shipView(snapshot, ship, combat),
    shieldImpacts: snapshot.shieldImpacts ?? [],
    npcShips: npcShipViews(npcShips, selectedNpcId, combat),
    wrecks,
    debris: snapshot.field.debris ?? [],
    sections: snapshot.field.sections ?? [],
    selectedWreck: wrecks.find((wreck) => wreck.isSelected) ?? null,
    navigationTarget: snapshot.navigationTarget,
    navigationRoute: snapshot.navigationRoute,
    phase: snapshot.phase,
    operationProgress: snapshot.operationProgress,
    longRangeScanProgress: snapshot.longRangeScanProgress ?? null,
    activeResourceId: snapshot.activeResourceId,
    salvageAvailable: snapshot.salvageAvailable,
    scanAvailable: snapshot.scanAvailable ?? true,
    cargoCapacityTons: snapshot.cargoCapacityTons,
    cargoUsedTons:
      cargoResources.reduce((sum, entry) => sum + entry.amount, 0) +
      looseComponents.reduce((sum, component) => sum + component.cargoTons, 0),
    cargoResources,
    looseComponents: looseComponents.map((component) => ({
      uid: component.uid,
      name: component.name,
      tier: component.tier,
      cargoTons: component.cargoTons,
    })),
    lastRecovery: snapshot.lastRecovery,
    recoverySerial: snapshot.recoverySerial,
    lastComponentRecovery: snapshot.lastComponentRecovery,
    componentRecoverySerial: snapshot.componentRecoverySerial,
    salvageEvent: snapshot.salvageEvent,
    salvageEventRecoverySeconds: snapshot.salvageEventRecoverySeconds,
    lastEventResolution: snapshot.lastEventResolution,
    eventResolutionSerial: snapshot.eventResolutionSerial,
    combat,
    sectorEvent,
    distressTow,
    distressRamming,
    distressRepairing,
  };
}
