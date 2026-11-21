import { drawCombatAsteroids } from './combat-asteroid-renderer';
import {
  paintParallelNativeDuels,
  updateParallelNativeImpacts,
  updateParallelAutocannonBursts,
} from './parallel-native-duel-overlay';
import {
  paintNativeProjectile,
  paintNativeAutocannonBursts,
  paintNativeMines,
  paintNativeTractorThrows,
} from './combat-native-weapon-painters';
import {
  DRONE_DIAMETER_PX,
  DRONE_ROTATION_PERIOD_SECONDS,
  drawDroneShield,
  drawDroneShieldHits,
} from '../local-space/local-security-drone-visual';
import { CombatAsteroidBackdrop } from './combat-asteroid-backdrop';
import type {
  Point,
  AutocannonVisualBurst,
  VisibleCombatImpact,
} from './strategic-combat-renderer-types';
import { drawCombatShipStatus } from './combat-status-renderer';
import { drawCombatRamEffect, ramCameraImpulse } from './combat-ram-effect-renderer';
import { CombatEffectClock } from './combat-effect-clock';
import { drawCombatImpactBatch } from './combat-impact-visual-batch';
import { missedShotAbove } from '../../systems/combat/combat-miss-depth';
import { CombatCamera, type CombatCameraPose } from './combat-camera';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import { drawCombatShipBody, drawCombatShipCaption } from './combat-ship-detail-renderer';
import { WEAPON_VISUALS } from '../../core/weapon-visual-profiles';
import { VISION_IMPACT_SECONDS } from '../../core/combat-visual-timings';
import { drawCombatEscapeGate } from './combat-escape-gate-renderer';
import { drawCombatBoostMeter } from './combat-boost-meter-renderer';
import { drawCombatBeamVisual } from './combat-beam-visual';
import { clamp01 } from './strategic-combat-renderer-math';
import { drawCombatBackground } from './combat-background-renderer';
import type { DistressDamageParticles } from '../salvage/distress-damage-particles';
import { drawCombatDamagePair } from './combat-damage-visual';
import { paintNativeDuelDestruction } from './combat-wreck-destruction-renderer';
import { CombatFleetWreckEffects, nativeFleetVisibility } from './combat-fleet-wreck-effects';
import { drawCombatGrapple } from './combat-grapple-renderer';
import type {
  CombatBeamSnapshot,
  CombatProjectileSnapshot,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-service';
import { getShipDefinition } from '../../systems/ships';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { projectHardpoint, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { drawPirateInsignia } from '../ships/pirate-insignia-renderer';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { ShieldImpactRenderer } from '../ships/shield-impact-renderer';
export class StrategicCombatRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly spaceBodies: ProceduralSpaceBodyRenderer;
  private readonly asteroidBackdrop: CombatAsteroidBackdrop;
  private readonly camera = new CombatCamera();
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly damageParticles = new Map<string, DistressDamageParticles>();
  private readonly fleetWreckEffects = new CombatFleetWreckEffects();
  private hiddenShipIds: ReadonlySet<string> = new Set();
  private hiddenDamageIds: ReadonlySet<string> = new Set();
  private destructionStartedAt: number | null = null;
  private readonly engineEffects = new ShipEngineEffectsRenderer();
  private readonly maneuverEffects = new ShipManeuverEffectsRenderer();
  private readonly lighting = new ShipLightingRenderer();
  private readonly shieldImpacts = new ShieldImpactRenderer();
  private readonly autocannonBursts = new Map<string, AutocannonVisualBurst>();
  private model: StrategicCombatSnapshot;
  private parallelDuels: readonly StrategicCombatSnapshot[] = [];
  private supportingFromIndex = Number.POSITIVE_INFINITY;
  private readonly additionalSeenImpacts = new Map<number, number>();
  private readonly additionalImpacts = new Map<number, VisibleCombatImpact[]>();
  private readonly effectClock = new CombatEffectClock();
  private seenImpactSerial = -1;
  private readonly visibleImpacts: VisibleCombatImpact[] = [];
  constructor(
    private readonly canvas: HTMLCanvasElement,
    model: StrategicCombatSnapshot,
    private readonly drawCareerActors?: (
      pose: CombatCameraPose,
      width: number,
      height: number,
      timeSeconds: number
    ) => void
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Strategic combat canvas context unavailable.');
    this.context = context;
    this.spaceBodies = new ProceduralSpaceBodyRenderer(context);
    this.asteroidBackdrop = new CombatAsteroidBackdrop(context, model.arena);
    this.model = model;
    this.resize();
  }
  update(
    model: StrategicCombatSnapshot,
    parallelDuels: readonly StrategicCombatSnapshot[] = [],
    supportingFromIndex = Number.POSITIVE_INFINITY,
    departedIds: readonly string[] = []
  ): void {
    this.parallelDuels = parallelDuels;
    this.supportingFromIndex = supportingFromIndex;
    const visibility = nativeFleetVisibility(model, parallelDuels, departedIds);
    this.hiddenShipIds = visibility.escaped;
    this.hiddenDamageIds = visibility.damageHidden;
    if (model.winner !== null && this.model.winner === null)
      this.destructionStartedAt = performance.now() / 1000;
    if (model.winner === null) this.destructionStartedAt = null;
    const sharedElapsed = Math.max(
      model.elapsedSeconds,
      ...parallelDuels.map((duel) => duel.elapsedSeconds)
    );
    const allFinished =
      model.winner !== null && parallelDuels.every((duel) => duel.winner !== null);
    this.effectClock.update(sharedElapsed, allFinished, performance.now() / 1000);
    updateParallelAutocannonBursts([model, ...parallelDuels], this.autocannonBursts, sharedElapsed);
    const recentImpacts = model.recentImpacts ?? [];
    const finalImpact = model.lastImpact ? [model.lastImpact] : [];
    const unseen = [...recentImpacts, ...finalImpact]
      .filter((impact) => impact.serial > this.seenImpactSerial)
      .sort((a, b) => a.serial - b.serial);
    for (const impact of unseen) {
      this.seenImpactSerial = impact.serial;
      const flightDelay = impact.weaponFamily
        ? WEAPON_VISUALS[impact.weaponFamily].impactDelaySeconds
        : 0;
      this.visibleImpacts.push({ impact, startedAt: model.elapsedSeconds + flightDelay });
    }
    const visualNow = this.effectClock.elapsed(performance.now() / 1000);
    for (let index = this.visibleImpacts.length - 1; index >= 0; index -= 1) {
      const visible = this.visibleImpacts[index]!;
      if (visualNow - visible.startedAt >= VISION_IMPACT_SECONDS) {
        this.visibleImpacts.splice(index, 1);
      }
    }
    updateParallelNativeImpacts(
      parallelDuels,
      visualNow,
      this.additionalSeenImpacts,
      this.additionalImpacts
    );
    this.model = model;
    this.draw();
  }
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }
  private image(shipId: string, securityDrone = false): HTMLImageElement | null {
    const definition = getShipDefinition(shipId);
    if (!definition && !securityDrone) return null;
    const key = securityDrone ? 'security-drone-sprite' : shipId;
    const cached = this.images.get(key);
    if (cached) return cached;
    const image = new Image();
    image.onload = () => this.draw();
    image.src = securityDrone ? '/drones/security-drone-gc87r8.webp' : definition!.sprite.assetUrl;
    this.images.set(key, image);
    return image;
  }
  cameraPose(): CombatCameraPose {
    return this.camera.pose();
  }
  restoreCameraPose(pose: CombatCameraPose): void {
    this.camera.restorePose(pose);
    this.draw();
  }
  pan(dx: number, dy: number): void {
    this.camera.pan(dx, dy);
    this.draw();
  }
  zoomAt(factor: number, x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.zoomAt(factor, x, y, rect.width, rect.height);
    this.draw();
  }
  private screen(point: Point, width: number, height: number): Point {
    return this.camera.project(
      point,
      width,
      height,
      this.model.arena.width,
      this.model.arena.height
    );
  }
  private shipGeometry(
    combatant: StrategicCombatSnapshot['attacker'],
    width: number,
    height: number
  ): ShipScreenGeometry {
    const isDrone = combatant.id.startsWith('security-drone:');
    const image = this.image(combatant.shipId, isDrone);
    const definition = getShipDefinition(combatant.shipId);
    const nominalLength = definition?.nominalLengthMeters ?? 60;
    const canvasScale = this.camera.scale(
      width,
      height,
      this.model.arena.width,
      this.model.arena.height
    );
    const shipWidth = isDrone ? DRONE_DIAMETER_PX * this.camera.zoom : nominalLength * canvasScale;
    const aspect = isDrone
      ? 1
      : image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : definition
          ? definition.sprite.widthPx / definition.sprite.heightPx
          : 2.2;
    return {
      center: this.screen(combatant.position, width, height),
      width: shipWidth,
      height: shipWidth / Math.max(0.35, aspect),
      angle: combatant.headingRadians,
    };
  }
  private draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const timeSeconds = performance.now() / 1000;
    const visualElapsed = this.effectClock.elapsed(timeSeconds);
    this.context.clearRect(0, 0, width, height);
    const shake = ramCameraImpulse(this.model.attacker, this.model.defender, visualElapsed);
    this.context.save();
    this.context.translate(shake.x, shake.y);
    drawCombatBackground(
      this.context,
      width,
      height,
      this.model.attacker.id,
      this.model.defender.id
    );
    this.asteroidBackdrop.draw(width, height, this.camera);
    drawCombatAsteroids(
      this.spaceBodies,
      this.model.arena.asteroids ?? [],
      this.camera.scale(width, height, this.model.arena.width, this.model.arena.height),
      (point) => this.screen(point, width, height),
      this.context,
      timeSeconds
    );
    paintNativeTractorThrows(
      this.context,
      this.model.winner === null ? this.model.thrownAsteroids : [],
      this.camera.scale(width, height, this.model.arena.width, this.model.arena.height),
      (point) => this.screen(point, width, height),
      timeSeconds
    );
    drawCombatEscapeGate(this.context, this.screen(this.model.exitPoint, width, height));
    this.drawMines(width, height);
    this.drawProjectiles(width, height, false);
    this.drawAutocannonBursts(width, height);
    this.drawBeams(width, height, false);
    drawCombatGrapple(this.context, this.model, (side) => {
      const combatant = this.model[side];
      const geometry = this.shipGeometry(combatant, width, height);
      const points = getShipDefinition(combatant.shipId)?.sprite.hardpoints;
      const mount = points?.grapplingHooks?.[0];
      return points && mount ? projectHardpoint(mount, points, geometry) : geometry.center;
    });
    if (this.model.winner === null || this.model.attacker.hullHp > 0)
      this.drawShip(this.model.attacker, width, height, timeSeconds, visualElapsed);
    if (this.model.winner === null || this.model.defender.hullHp > 0)
      this.drawShip(this.model.defender, width, height, timeSeconds, visualElapsed);
    drawCombatDamagePair(
      this.context,
      [this.model.attacker, this.model.defender],
      (combatant) => this.shipGeometry(combatant, width, height),
      this.damageParticles,
      timeSeconds,
      width,
      height,
      this.hiddenDamageIds
    );
    this.drawProjectiles(width, height, true);
    this.drawBeams(width, height, true);
    this.drawHullImpacts(width, height, visualElapsed);
    this.destructionStartedAt = paintNativeDuelDestruction(
      this.context,
      this.model,
      (ship) => this.shipGeometry(ship, width, height),
      timeSeconds,
      this.destructionStartedAt,
      this.hiddenDamageIds
    );
    this.drawAdditionalDuels(width, height, timeSeconds, visualElapsed);
    this.fleetWreckEffects.draw(
      this.context,
      this.model.arena.asteroids ?? [],
      (point) => this.screen(point, width, height),
      this.camera.scale(width, height, this.model.arena.width, this.model.arena.height),
      timeSeconds,
      width,
      height
    );
    this.drawCareerActors?.(this.camera.pose(), width, height, timeSeconds);
    this.context.restore();
  }
  private drawAdditionalDuels(
    width: number,
    height: number,
    timeSeconds: number,
    visualElapsed: number
  ): void {
    paintParallelNativeDuels({
      context: this.context,
      duels: this.parallelDuels,
      supportingFromIndex: this.supportingFromIndex,
      hiddenIds: this.hiddenDamageIds,
      scale: this.camera.scale(width, height, this.model.arena.width, this.model.arena.height),
      project: (point) => this.screen(point, width, height),
      geometry: (ship) => this.shipGeometry(ship, width, height),
      paintShip: (ship) => this.drawShip(ship, width, height, timeSeconds, visualElapsed),
      paintBeam: (beam) => this.drawBeam(beam, width, height),
      paintProjectile: (shot) =>
        this.drawProjectile(
          shot,
          this.screen(shot.position, width, height),
          this.screen(shot.target, width, height)
        ),
      damageParticles: this.damageParticles,
      visibleImpacts: this.additionalImpacts,
      width,
      height,
      timeSeconds,
      visualElapsed,
    });
  }
  private drawBeams(width: number, height: number, above: boolean): void {
    if (this.model.winner !== null) return;
    for (const beam of this.model.beams) {
      if (beam.ttlSeconds <= 0) continue;
      if (Boolean(beam.missed && missedShotAbove(beam.id)) !== above) continue;
      this.drawBeam(beam, width, height);
    }
  }
  private drawBeam(beam: CombatBeamSnapshot, width: number, height: number): void {
    const start = this.screen(beam.origin, width, height);
    const end = this.screen(beam.end, width, height);
    drawCombatBeamVisual(this.context, beam, start, end);
  }
  private drawProjectiles(width: number, height: number, above: boolean): void {
    if (this.model.winner !== null) return;
    for (const projectile of this.model.projectiles) {
      if (projectile.kind === 'autocannon') continue;
      if (Boolean(projectile.missed && missedShotAbove(projectile.id)) !== above) continue;
      const point = this.screen(projectile.position, width, height);
      const target = this.screen(projectile.target, width, height);
      this.drawProjectile(projectile, point, target);
    }
  }
  private drawAutocannonBursts(width: number, height: number): void {
    if (this.model.winner !== null && !this.parallelDuels.some((duel) => !duel.winner)) return;
    paintNativeAutocannonBursts(
      this.context,
      this.autocannonBursts.values(),
      (point) => this.screen(point, width, height),
      this.effectClock.elapsed(performance.now() / 1000)
    );
  }
  private drawProjectile(projectile: CombatProjectileSnapshot, point: Point, target: Point): void {
    paintNativeProjectile(
      this.context,
      projectile,
      point,
      target,
      this.model.elapsedSeconds,
      this.camera.zoom
    );
  }
  private drawMines(width: number, height: number): void {
    paintNativeMines(this.context, this.model.mines, (point) => this.screen(point, width, height));
  }
  private drawShip(
    combatant: StrategicCombatSnapshot['attacker'],
    width: number,
    height: number,
    timeSeconds: number,
    visualElapsed: number
  ): void {
    if (combatant.hullHp <= 0 || this.hiddenShipIds.has(combatant.id)) return;
    const definition = getShipDefinition(combatant.shipId);
    const isDrone = combatant.id.startsWith('security-drone:');
    const geometry = {
      ...this.shipGeometry(combatant, width, height),
      ...(isDrone ? { angle: (timeSeconds * Math.PI * 2) / DRONE_ROTATION_PERIOD_SECONDS } : {}),
    };
    const hullRatio = clamp01(combatant.hullHp / Math.max(1, combatant.hullMaxHp));
    const hardpoints = isDrone ? undefined : definition?.sprite.hardpoints;
    const engineIntensity =
      combatant.subsystems.engine > 0 ? Math.max(0, Math.min(1, combatant.speed / 120)) : 0;
    const maneuverDemand = {
      turnRateRadiansPerSecond: combatant.turnRateRadiansPerSecond,
      angularThrust: combatant.angularThrust,
      lateralThrust: combatant.lateralThrust ?? 0,
      longitudinalThrust: combatant.longitudinalThrust ?? 0,
    };
    if (hardpoints) {
      this.engineEffects.drawExhaust(
        this.context,
        hardpoints,
        geometry,
        engineIntensity,
        timeSeconds,
        'below',
        combatant.boostActive
      );
      this.maneuverEffects.drawExhaust(
        this.context,
        hardpoints,
        geometry,
        maneuverDemand,
        timeSeconds,
        'below'
      );
    }
    drawCombatShipBody(
      this.context,
      geometry,
      hullRatio,
      this.image(combatant.shipId, isDrone),
      hardpoints,
      this.lighting
    );
    if (isDrone) {
      drawDroneShield(
        this.context,
        geometry.center.x,
        geometry.center.y,
        geometry.width * 0.62,
        combatant.shieldHp / Math.max(1, combatant.shieldMaxHp),
        combatant.shieldImpacts.length > 0 ? 0.85 : 0
      );
      drawDroneShieldHits(
        this.context,
        geometry.center.x,
        geometry.center.y,
        geometry.width * 0.62,
        combatant.shieldImpacts
      );
    }
    if (combatant.pirateMark)
      drawPirateInsignia(this.context, combatant.pirateMark, geometry);
    if (hardpoints) {
      this.engineEffects.drawGlow(
        this.context,
        hardpoints,
        geometry,
        engineIntensity,
        timeSeconds,
        'above'
      );
      this.maneuverEffects.drawGlow(
        this.context,
        hardpoints,
        geometry,
        maneuverDemand,
        timeSeconds,
        'above'
      );
      this.shieldImpacts.draw(this.context, combatant.shieldImpacts, hardpoints, geometry);
    }
    drawCombatRamEffect(this.context, combatant, geometry, visualElapsed);
    drawCombatShipCaption(this.context, combatant.name, hullRatio, geometry);
    drawCombatShipStatus(this.context, combatant, geometry);
    drawCombatBoostMeter(
      this.context,
      geometry.center,
      geometry.height,
      combatant.boostSeconds,
      combatant.boostActive
    );
  }
  private drawHullImpacts(width: number, height: number, visualElapsed: number): void {
    drawCombatImpactBatch(
      this.context,
      this.visibleImpacts,
      visualElapsed,
      (point) => this.screen(point, width, height),
      (side) => this.shipGeometry(this.model[side], width, height).height
    );
  }
}
