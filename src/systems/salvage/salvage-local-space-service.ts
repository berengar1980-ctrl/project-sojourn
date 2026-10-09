import type {
  SalvageLocalPhase,
  SalvageLocalSpaceSnapshot,
  SalvageWreck,
} from '../../core/salvage-types';
import type { LocalShipState } from '../../core/local-space-types';
import type { EconomyResourceId } from '../../core/economy-types';
import type { WorldPoint } from '../../core/world-types';
import { advanceAutopilotRoute, resetAutopilotMotion } from '../local-space/local-space-autopilot';
import { distance } from '../local-space/local-space-motion';
import { salvageWorkTimeMultiplier } from '../crew/crew-skill-effects';
import type { ShipSalvageSetup } from '../ships/ship-salvage-capability';
import { createSalvageEventController } from './salvage-event-service';
import {
  createSalvageFieldService,
  type SalvageComponentCollector,
  type SalvageFieldService,
  type SalvageResourceCollector,
} from './salvage-field-service';

const INSPECTION_SECONDS = 2.8;
const WORK_STANDOFF = 105;
const COMPONENT_CYCLE_MULTIPLIER = 1.45;

type ApproachPurpose = 'inspect' | 'strip' | 'component';

export interface SalvageLocalSpaceService {
  getSnapshot(): SalvageLocalSpaceSnapshot;
  selectWreck(wreckId: string | null): SalvageLocalSpaceSnapshot;
  startNavigation(target: WorldPoint): SalvageLocalSpaceSnapshot;
  startInspect(wreckId: string): SalvageLocalSpaceSnapshot;
  startStrip(wreckId: string, resourceId: EconomyResourceId): SalvageLocalSpaceSnapshot;
  startComponentRecovery(wreckId: string): SalvageLocalSpaceSnapshot;
  resolveSalvageEvent(choiceId: string): SalvageLocalSpaceSnapshot['lastEventResolution'];
  cancelOperation(): SalvageLocalSpaceSnapshot;
  syncCombatPose(
    position: WorldPoint,
    headingRadians: number,
    speed: number
  ): SalvageLocalSpaceSnapshot;
  tick(deltaSeconds: number): SalvageLocalSpaceSnapshot;
}

interface SalvageRuntimeOptions {
  readonly field: SalvageLocalSpaceSnapshot['field'];
  readonly setup: ShipSalvageSetup;
  readonly crewSkill: number;
  readonly collect: SalvageResourceCollector;
  readonly collectComponent?: SalvageComponentCollector;
  readonly approachSpeed: number;
}

function clampPoint(point: WorldPoint, width: number, height: number): WorldPoint {
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y)),
  };
}

function workPoint(ship: LocalShipState, wreck: SalvageWreck): WorldPoint {
  const dx = ship.position.x - wreck.position.x;
  const dy = ship.position.y - wreck.position.y;
  const length = Math.hypot(dx, dy) || 1;
  const range = wreck.radius +
    (wreck.id.startsWith('event-wreck-salvage-distress-') ? 45 : WORK_STANDOFF);
  return {
    x: wreck.position.x + (dx / length) * range,
    y: wreck.position.y + (dy / length) * range,
  };
}

class SalvageLocalSpaceRuntime implements SalvageLocalSpaceService {
  private readonly salvage: SalvageFieldService;
  private readonly events;
  private readonly ship: LocalShipState;
  private selectedWreckId: string | null = null;
  private workTargetId: string | null = null;
  private phase: SalvageLocalPhase = 'idle';
  private activeResourceId: EconomyResourceId | null = null;
  private navigationTarget: WorldPoint | null = null;
  private navigationRoute: readonly WorldPoint[] = [];
  private routeIndex = 0;
  private elapsed = 0;
  private approachPurpose: ApproachPurpose | null = null;
  private lastRecovery: SalvageLocalSpaceSnapshot['lastRecovery'] = null;
  private recoverySerial = 0;
  private lastComponentRecovery: SalvageLocalSpaceSnapshot['lastComponentRecovery'] = null;
  private componentRecoverySerial = 0;
  private lastEventResolution: SalvageLocalSpaceSnapshot['lastEventResolution'] = null;
  private eventResolutionSerial = 0;

  constructor(private readonly options: SalvageRuntimeOptions) {
    this.salvage = createSalvageFieldService({
      field: options.field,
      setup: options.setup,
      crewSkill: options.crewSkill,
      collect: options.collect,
      ...(options.collectComponent ? { collectComponent: options.collectComponent } : {}),
    });
    this.events = createSalvageEventController(options.field.seed);
    this.ship = {
      position: { x: options.field.width * 0.5, y: options.field.height * 0.5 },
      headingRadians: 0,
      speed: 0,
      turnRateRadiansPerSecond: 0,
      angularThrust: 0,
      lateralThrust: 0,
    };
  }

  getSnapshot(): SalvageLocalSpaceSnapshot {
    return {
      field: this.options.field,
      ship: this.ship,
      selectedWreckId: this.selectedWreckId,
      workTargetId: this.workTargetId,
      navigationTarget: this.navigationTarget,
      navigationRoute: this.navigationRoute,
      phase: this.phase,
      operationProgress: this.operationProgress(),
      activeResourceId: this.activeResourceId,
      lastRecovery: this.lastRecovery,
      recoverySerial: this.recoverySerial,
      lastComponentRecovery: this.lastComponentRecovery,
      componentRecoverySerial: this.componentRecoverySerial,
      componentRecoveryChances: Object.fromEntries(
        this.options.field.wrecks
          .map((wreck) => [wreck.id, this.salvage.componentChance(wreck.id)] as const)
          .filter((entry): entry is readonly [string, number] => entry[1] !== null)
      ),
      salvageEvent: this.events.pending,
      salvageEventRecoverySeconds: this.events.recoverySeconds,
      lastEventResolution: this.lastEventResolution,
      eventResolutionSerial: this.eventResolutionSerial,
      salvageAvailable: this.options.setup.available,
      cargoCapacityTons: this.options.setup.cargoCapacityTons,
    };
  }

  selectWreck(wreckId: string | null): SalvageLocalSpaceSnapshot {
    if (wreckId === null || this.findWreck(wreckId)) this.selectedWreckId = wreckId;
    return this.getSnapshot();
  }

  startNavigation(target: WorldPoint): SalvageLocalSpaceSnapshot {
    const clamped = clampPoint(target, this.options.field.width, this.options.field.height);
    this.workTargetId = null;
    this.activeResourceId = null;
    this.approachPurpose = null;
    this.beginRoute(clamped, 'navigating');
    return this.getSnapshot();
  }

  startInspect(wreckId: string): SalvageLocalSpaceSnapshot {
    const wreck = this.findWreck(wreckId);
    if (!wreck) return this.getSnapshot();
    this.selectedWreckId = wreckId;
    this.workTargetId = wreckId;
    this.activeResourceId = null;
    if (this.withinWorkRange(wreck)) this.beginInspection();
    else this.beginApproach(wreck, 'inspect');
    return this.getSnapshot();
  }

  startStrip(wreckId: string, resourceId: EconomyResourceId): SalvageLocalSpaceSnapshot {
    const wreck = this.findWreck(wreckId);
    if (!wreck?.inspected || !this.options.setup.available || this.events.blocked) {
      return this.getSnapshot();
    }
    const deposit = wreck.resources.find(
      (entry) => entry.resourceId === resourceId && entry.remainingAmount > 0
    );
    if (!deposit) return this.getSnapshot();

    this.selectedWreckId = wreckId;
    this.workTargetId = wreckId;
    this.activeResourceId = resourceId;
    if (this.withinWorkRange(wreck)) this.beginStripping();
    else this.beginApproach(wreck, 'strip');
    return this.getSnapshot();
  }

  startComponentRecovery(wreckId: string): SalvageLocalSpaceSnapshot {
    const wreck = this.findWreck(wreckId);
    if (
      !wreck?.inspected ||
      wreck.componentStatus !== 'available' ||
      !this.options.setup.available ||
      this.events.blocked
    ) {
      return this.getSnapshot();
    }

    this.selectedWreckId = wreckId;
    this.workTargetId = wreckId;
    this.activeResourceId = null;
    if (this.withinWorkRange(wreck)) this.beginComponentRecovery();
    else this.beginApproach(wreck, 'component');
    return this.getSnapshot();
  }

  resolveSalvageEvent(choiceId: string): SalvageLocalSpaceSnapshot['lastEventResolution'] {
    const pending = this.events.pending;
    const wreck = this.findWreck(pending?.wreckId ?? null);
    if (!pending || !wreck) return null;
    const result = this.events.resolve(wreck, choiceId);
    if (!result) return null;
    this.lastEventResolution = result;
    this.eventResolutionSerial += 1;
    return result;
  }

  cancelOperation(): SalvageLocalSpaceSnapshot {
    this.finishIdle();
    this.navigationRoute = [];
    this.navigationTarget = null;
    return this.getSnapshot();
  }

  syncCombatPose(
    position: WorldPoint,
    headingRadians: number,
    speed: number
  ): SalvageLocalSpaceSnapshot {
    this.ship.position = clampPoint(position, this.options.field.width, this.options.field.height);
    this.ship.headingRadians = headingRadians;
    this.ship.speed = Math.max(0, speed);
    this.navigationTarget = null;
    this.navigationRoute = [];
    this.routeIndex = 0;
    this.finishIdle();
    return this.getSnapshot();
  }

  tick(deltaSeconds: number): SalvageLocalSpaceSnapshot {
    const delta = Math.max(0, Math.min(0.05, deltaSeconds));
    this.events.tick(delta);
    if (this.phase === 'navigating' || this.phase === 'approaching') {
      this.updateRoute(delta);
    } else if (this.phase === 'inspecting') {
      this.updateInspection(delta);
    } else if (this.phase === 'stripping') {
      this.updateStripping(delta);
    } else if (this.phase === 'extracting-component') {
      this.updateComponentRecovery(delta);
    }
    return this.getSnapshot();
  }

  private findWreck(wreckId: string | null): SalvageWreck | null {
    if (!wreckId) return null;
    return this.options.field.wrecks.find((wreck) => wreck.id === wreckId) ?? null;
  }

  private withinWorkRange(wreck: SalvageWreck): boolean {
    return distance(this.ship.position, wreck.position) <= wreck.radius + WORK_STANDOFF + 6;
  }

  private beginApproach(wreck: SalvageWreck, purpose: ApproachPurpose): void {
    this.approachPurpose = purpose;
    this.beginRoute(
      clampPoint(workPoint(this.ship, wreck), this.options.field.width, this.options.field.height),
      'approaching'
    );
  }

  private beginRoute(target: WorldPoint, phase: SalvageLocalPhase): void {
    this.phase = phase;
    this.elapsed = 0;
    this.navigationTarget = target;
    this.navigationRoute = [{ ...this.ship.position }, target];
    this.routeIndex = 1;
  }

  private updateRoute(deltaSeconds: number): void {
    const result = advanceAutopilotRoute(
      this.ship,
      this.navigationRoute,
      this.routeIndex,
      this.options.approachSpeed,
      deltaSeconds,
      true,
      true
    );
    this.routeIndex = result.nextIndex;
    if (!result.completed) return;

    this.navigationRoute = [];
    this.navigationTarget = null;
    if (this.phase === 'navigating') {
      this.finishIdle();
      return;
    }
    if (this.approachPurpose === 'inspect') this.beginInspection();
    else if (this.approachPurpose === 'strip') this.beginStripping();
    else if (this.approachPurpose === 'component') this.beginComponentRecovery();
    else this.finishIdle();
  }

  private beginInspection(): void {
    this.phase = 'inspecting';
    this.elapsed = 0;
    this.approachPurpose = null;
    resetAutopilotMotion(this.ship);
  }

  private updateInspection(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;
    if (this.elapsed < INSPECTION_SECONDS) return;
    if (this.workTargetId) {
      const wreck = this.salvage.inspectWreck(this.workTargetId);
      if (wreck) this.events.inspect(wreck);
    }
    this.finishIdle();
  }

  private beginStripping(): void {
    this.phase = 'stripping';
    this.elapsed = 0;
    this.approachPurpose = null;
    resetAutopilotMotion(this.ship);
  }

  private updateStripping(deltaSeconds: number): void {
    const cycleSeconds = this.salvageCycleSeconds();
    this.elapsed += deltaSeconds;
    if (this.elapsed < cycleSeconds) return;
    this.elapsed -= cycleSeconds;
    if (!this.workTargetId || !this.activeResourceId) return this.finishIdle();

    const result = this.salvage.recoverResource(this.workTargetId, this.activeResourceId);
    if (!result) return this.finishIdle();
    this.lastRecovery = result;
    this.recoverySerial += 1;
    if (result.remaining <= 0 || result.depleted) this.finishIdle();
  }

  private beginComponentRecovery(): void {
    this.phase = 'extracting-component';
    this.elapsed = 0;
    this.approachPurpose = null;
    resetAutopilotMotion(this.ship);
  }

  private updateComponentRecovery(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;
    if (this.elapsed < this.componentCycleSeconds()) return;
    if (!this.workTargetId) return this.finishIdle();

    const result = this.salvage.recoverComponent(this.workTargetId);
    if (result) {
      this.lastComponentRecovery = result;
      this.componentRecoverySerial += 1;
    }
    this.finishIdle();
  }

  private salvageCycleSeconds(): number {
    return Math.max(
      0.05,
      this.options.setup.cycleSeconds * salvageWorkTimeMultiplier(this.options.crewSkill)
    );
  }

  private componentCycleSeconds(): number {
    return Math.max(2.5, this.salvageCycleSeconds() * COMPONENT_CYCLE_MULTIPLIER);
  }

  private operationProgress(): number | null {
    if (this.phase === 'inspecting') return Math.min(1, this.elapsed / INSPECTION_SECONDS);
    if (this.phase === 'stripping') {
      return Math.min(1, this.elapsed / this.salvageCycleSeconds());
    }
    if (this.phase === 'extracting-component') {
      return Math.min(1, this.elapsed / this.componentCycleSeconds());
    }
    return null;
  }

  private finishIdle(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.navigationTarget = null;
    this.navigationRoute = [];
    this.routeIndex = 0;
    this.approachPurpose = null;
    this.activeResourceId = null;
    this.workTargetId = null;
    resetAutopilotMotion(this.ship);
  }
}

export function createSalvageLocalSpaceService(
  options: SalvageRuntimeOptions
): SalvageLocalSpaceService {
  return new SalvageLocalSpaceRuntime(options);
}
