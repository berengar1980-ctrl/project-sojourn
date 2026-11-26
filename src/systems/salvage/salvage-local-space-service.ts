import type { SalvageLocalSpaceService, SalvageRuntimeOptions } from './salvage-local-space-types';
export type { SalvageLocalSpaceService } from './salvage-local-space-types';
import {
  clampPoint,
  createInitialSalvageShip,
  distressDiagnosisInRange,
  planSalvageRoute,
  salvageWorkInRange,
  workPoint,
} from './salvage-work-navigation';
import {
  advanceSalvageContainerDrift,
  resolveSalvageShieldContacts,
} from './salvage-container-motion';
import { applySalvageShieldContact } from './salvage-shield-contact';
import { advanceSalvageLongRangeScan } from './salvage-field-scan';
import {
  INSPECTION_SECONDS,
  DISTRESS_DIAGNOSIS_SECONDS,
  salvageOperationProgress,
} from './salvage-operation-progress';
import { createLocalSpaceShipSystems } from '../local-space/local-space-ship-systems';
import type {
  SalvageLocalPhase,
  SalvageLocalSpaceSnapshot,
  SalvageWreck,
} from '../../core/salvage-types';
import type { LocalShipState } from '../../core/local-space-types';
import type { EconomyResourceId } from '../../core/economy-types';
import type { WorldPoint } from '../../core/world-types';
import { advanceAutopilotRoute, resetAutopilotMotion } from '../local-space/local-space-autopilot';
import { salvageWorkTimeMultiplier } from '../crew/crew-skill-effects';
import { createSalvageEventController } from './salvage-event-service';
import { createSalvageFieldService, type SalvageFieldService } from './salvage-field-service';

export { DISTRESS_DIAGNOSIS_SECONDS } from './salvage-operation-progress';
const COMPONENT_CYCLE_MULTIPLIER = 1.45;

type ApproachPurpose = 'inspect' | 'diagnose' | 'strip' | 'component';

class SalvageLocalSpaceRuntime implements SalvageLocalSpaceService {
  private readonly salvage: SalvageFieldService;
  private readonly events;
  private readonly ship: LocalShipState;
  private readonly collisionShields: ReturnType<typeof createLocalSpaceShipSystems> | null;
  private shipContactCooldown = 0;
  private selectedWreckId: string | null = null;
  private longRangeScanElapsed: number | null = null;
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
  private diagnosisSerial = 0;
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
    this.collisionShields = options.hardpoints
      ? createLocalSpaceShipSystems(undefined, options.hardpoints)
      : null;
    this.ship = createInitialSalvageShip(options.field);
  }

  getSnapshot(): SalvageLocalSpaceSnapshot {
    return {
      field: this.options.field,
      ship: this.ship,
      shieldImpacts: this.collisionShields?.snapshot().shieldImpacts ?? [],
      selectedWreckId: this.selectedWreckId,
      workTargetId: this.workTargetId,
      navigationTarget: this.navigationTarget,
      navigationRoute: this.navigationRoute,
      phase: this.phase,
      operationProgress: salvageOperationProgress(
        this.phase,
        this.elapsed,
        this.salvageCycleSeconds(),
        this.componentCycleSeconds()
      ),
      longRangeScanProgress:
        this.longRangeScanElapsed === null ? null : Math.min(1, this.longRangeScanElapsed / 5),
      activeResourceId: this.activeResourceId,
      lastRecovery: this.lastRecovery,
      recoverySerial: this.recoverySerial,
      diagnosisSerial: this.diagnosisSerial,
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
      scanAvailable: this.options.scanAvailable ?? true,
      cargoCapacityTons: this.options.setup.cargoCapacityTons,
    };
  }

  selectWreck(wreckId: string | null): SalvageLocalSpaceSnapshot {
    if (wreckId !== null && !this.findWreck(wreckId)) return this.getSnapshot();
    const diagnosing = this.approachPurpose === 'diagnose' || this.phase === 'diagnosing';
    if (wreckId !== this.workTargetId && diagnosing) this.cancelOperation();
    this.selectedWreckId = wreckId;
    return this.getSnapshot();
  }

  recordShipShieldContact(normal: WorldPoint, overlap: number): void {
    if (this.shipContactCooldown > 0 || !this.collisionShields) return;
    this.shipContactCooldown = 0.35;
    applySalvageShieldContact(
      this.collisionShields,
      this.ship,
      normal,
      overlap,
      this.options.shipLengthMeters ?? 80
    );
  }

  startLongRangeScan(): SalvageLocalSpaceSnapshot {
    if (this.options.scanAvailable === false) return this.getSnapshot();
    if (this.longRangeScanElapsed === null) this.longRangeScanElapsed = 0;
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
    if (salvageWorkInRange(this.ship.position, wreck)) this.beginScan('inspecting');
    else this.beginApproach(wreck, 'inspect');
    return this.getSnapshot();
  }

  startDistressDiagnosis(wreckId: string): SalvageLocalSpaceSnapshot {
    const wreck = this.findWreck(wreckId);
    if (
      !wreck?.id.startsWith('event-wreck-salvage-distress-') ||
      wreckId !== this.selectedWreckId ||
      this.phase !== 'idle' ||
      this.events.blocked ||
      this.options.scanAvailable === false
    ) {
      return this.getSnapshot();
    }
    this.workTargetId = wreckId;
    this.activeResourceId = null;
    if (distressDiagnosisInRange(this.ship.position, wreck)) this.beginScan('diagnosing');
    else this.beginApproach(wreck, 'diagnose');
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
    if (salvageWorkInRange(this.ship.position, wreck)) this.beginStripping();
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
    if (salvageWorkInRange(this.ship.position, wreck)) this.beginComponentRecovery();
    else this.beginApproach(wreck, 'component');
    return this.getSnapshot();
  }

  resolveSalvageEvent(choiceId: string): SalvageLocalSpaceSnapshot['lastEventResolution'] {
    const pending = this.events.pending;
    const wreck = this.findWreck(pending?.wreckId ?? null);
    if (!pending || !wreck) return null;
    const resolved = this.events.resolve(wreck, choiceId);
    if (!resolved) return null;
    const result = this.options.onWreckEventResolved?.(wreck, resolved) ?? resolved;
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
    this.finishIdle();
    this.ship.speed = Math.max(0, speed);
    return this.getSnapshot();
  }

  tick(deltaSeconds: number, combatOwnsBodies?: boolean): SalvageLocalSpaceSnapshot {
    // Preserve real elapsed gameplay time on frames slower than 20 fps.
    // Previously frames above 50 ms were discarded and everything ran in slow motion.
    let remaining = Math.max(0, Math.min(0.15, deltaSeconds));
    while (remaining > 0.000001) {
      const delta = Math.min(0.05, remaining);
      remaining -= delta;
      this.events.tick(delta);
      this.collisionShields?.advance(delta);
      this.shipContactCooldown = Math.max(0, this.shipContactCooldown - delta);
      this.longRangeScanElapsed = advanceSalvageLongRangeScan(
        this.longRangeScanElapsed,
        delta,
        this.options.field,
        this.ship.position,
        this.options.sensorModifier ?? 1,
        this.options.sensorCrewSkill ?? this.options.crewSkill
      );
      if (!combatOwnsBodies) advanceSalvageContainerDrift(this.options.field, delta);
      if (this.phase === 'navigating' || this.phase === 'approaching') {
        this.updateRoute(delta);
      } else if (this.phase === 'inspecting') {
        this.updateInspection(delta);
      } else if (this.phase === 'diagnosing') {
        this.updateDiagnosis(delta);
      } else if (this.phase === 'stripping') {
        this.updateStripping(delta);
      } else if (this.phase === 'extracting-component') {
        this.updateComponentRecovery(delta);
      }
      if (this.options.hardpoints && this.options.shipLengthMeters) {
        for (const collision of resolveSalvageShieldContacts(
          this.options.field,
          this.ship,
          this.options.hardpoints,
          this.options.shipLengthMeters
        )) {
          this.collisionShields?.applyCollision(collision);
        }
      }
    }
    return this.getSnapshot();
  }

  private findWreck(wreckId: string | null): SalvageWreck | null {
    if (!wreckId) return null;
    return this.options.field.wrecks.find((wreck) => wreck.id === wreckId) ?? null;
  }

  private withinApproachRange(wreck: SalvageWreck): boolean {
    return this.approachPurpose === 'diagnose'
      ? distressDiagnosisInRange(this.ship.position, wreck)
      : salvageWorkInRange(this.ship.position, wreck);
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
    this.navigationRoute = planSalvageRoute(
      this.options.field,
      this.ship.position,
      target,
      this.options.shipLengthMeters ?? 70
    );
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
      true,
      this.options.turnRateMultiplier ?? 1
    );
    this.routeIndex = result.nextIndex;
    if (!result.completed) return;

    this.navigationRoute = [];
    this.navigationTarget = null;
    if (this.phase === 'navigating') {
      this.finishIdle();
      return;
    }
    const target = this.findWreck(this.workTargetId);
    if (target && !this.withinApproachRange(target)) {
      this.beginApproach(target, this.approachPurpose ?? 'inspect');
      return;
    }
    if (this.approachPurpose === 'inspect') this.beginScan('inspecting');
    else if (this.approachPurpose === 'diagnose') this.beginScan('diagnosing');
    else if (this.approachPurpose === 'strip') this.beginStripping();
    else if (this.approachPurpose === 'component') this.beginComponentRecovery();
    else this.finishIdle();
  }

  private beginScan(phase: 'inspecting' | 'diagnosing'): void {
    this.phase = phase;
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

  private updateDiagnosis(deltaSeconds: number): void {
    const target = this.findWreck(this.workTargetId);
    if (!target) return this.finishIdle();
    if (!distressDiagnosisInRange(this.ship.position, target)) {
      this.beginApproach(target, 'diagnose');
      return;
    }
    this.elapsed += deltaSeconds;
    if (this.elapsed < DISTRESS_DIAGNOSIS_SECONDS) return;
    this.diagnosisSerial += 1;
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
