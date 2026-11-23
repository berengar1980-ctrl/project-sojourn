import { drawPirateInsignia } from '../ships/pirate-insignia-renderer';
import { drawFieldShipSprite } from '../ships/field-ship-sprite';
import { isStationedDrone } from '../../systems/npcs/npc-combat-ai';
import type { PvPMapCamera } from '../combat/pvp-map-camera';
import { drawTargetDetailScan } from '../local-operations/scan-effects';
import {
  drawFieldEscort,
  drawLocalSecurityDrone,
  localDroneShieldHits,
} from '../local-space/local-security-drone-visual';
import { drawSalvageWorkEffect } from './salvage-work-effect-renderer';
import { drawFieldNpcThrusters } from '../combat/embedded-combat-thrusters';
import { drawEmbeddedCombatShipTelemetry } from '../combat/embedded-combat-ship-telemetry';
import type {
  SalvageNpcShipView,
  SalvageSpaceViewModel,
} from '../../features/salvage/salvage-space-view-model';
import { type ScreenPoint } from '../map/map-camera';
import { drawLocalSpaceExitGate } from '../map/local-space-exit-gate';
import { type ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { type ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { type ShipLightingRenderer } from '../ships/ship-lighting-renderer';
export interface WreckHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}
export interface NpcHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}
export function fractional(value: number): number {
  return value - Math.floor(value);
}
export function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export abstract class SalvageSceneLayers {
  protected abstract model: SalvageSpaceViewModel;
  protected abstract camera: PvPMapCamera;
  protected abstract ensureNpcImage(url: string): HTMLImageElement;
  protected abstract engineEffects: ShipEngineEffectsRenderer;
  protected abstract context: CanvasRenderingContext2D;
  protected abstract shipLighting: ShipLightingRenderer;
  protected abstract shieldImpacts: ShieldImpactRenderer;
  protected abstract shipGeometry(width: number, height: number): ShipScreenGeometry;
  protected drawExitGate(width: number, height: number): void {
    drawLocalSpaceExitGate(
      this.context,
      this.camera,
      width,
      height,
      this.model.width,
      this.model.height,
      this.model.backgroundSeed
    );
  }
  protected drawNpcSelection(point: ScreenPoint, geometry: ShipScreenGeometry): void {
    this.context.save();
    this.context.strokeStyle = 'rgba(235, 91, 76, 0.95)';
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(
      point.x,
      point.y,
      Math.max(geometry.width, geometry.height) * 0.65 + 7,
      0,
      Math.PI * 2
    );
    this.context.stroke();
    this.context.restore();
  }
  protected drawNpcShips(
    width: number,
    height: number,
    timeSeconds: number,
    excludedIds: ReadonlySet<string> = new Set()
  ): NpcHitArea[] {
    const hits: NpcHitArea[] = [];
    for (const npc of this.model.npcShips) {
      if (excludedIds.has(npc.id)) continue;
      if (npc.id.startsWith('security-drone:')) {
        hits.push(
          drawFieldEscort(
            this.context,
            this.camera,
            npc,
            width,
            height,
            timeSeconds,
            this.model.npcCombats
          )
        );
        continue;
      }
      const point = this.camera.worldToScreen(npc.position, width, height);
      const shipWidth = this.camera.scale(npc.nominalLengthMeters);
      const geometry: ShipScreenGeometry = {
        center: point,
        width: shipWidth,
        height: shipWidth / npc.spriteAspectRatio,
        angle: npc.headingRadians,
      };
      const image = this.ensureNpcImage(npc.spriteUrl);
      const combatDefender =
        this.model.combat?.defender.id === npc.id ? this.model.combat.defender : null;
      drawFieldNpcThrusters(
        this.context,
        npc.hardpoints,
        geometry,
        npc.speed,
        combatDefender,
        timeSeconds,
        'below',
        this.engineEffects,
        'salvage'
      );
      drawFieldShipSprite(
        this.context,
        this.shipLighting,
        image,
        npc.hardpoints,
        geometry,
        '#8e999f'
      );
      drawFieldNpcThrusters(
        this.context,
        npc.hardpoints,
        geometry,
        npc.speed,
        combatDefender,
        timeSeconds,
        'above',
        this.engineEffects,
        'salvage'
      );
      if (combatDefender) {
        this.shieldImpacts.draw(
          this.context,
          combatDefender.shieldImpacts,
          npc.hardpoints,
          geometry
        );
      }
      if (combatDefender) drawEmbeddedCombatShipTelemetry(this.context, combatDefender, geometry);
      hits.push({
        id: npc.id,
        point,
        radius: Math.max(18, Math.max(geometry.width, geometry.height) * 0.6),
      });
      if (npc.pirateMark) drawPirateInsignia(this.context, npc.pirateMark, geometry);
      if (npc.isSelected) this.drawNpcSelection(point, geometry);

      this.drawNpcWork(npc, point, geometry, width, height, timeSeconds);

      if (this.camera.getRelativeZoom() >= 1.55) {
        this.context.fillStyle = 'rgba(215, 202, 168, 0.8)';
        this.context.font = '9px ui-monospace, monospace';
        this.context.textAlign = 'center';
        this.context.fillText(npc.name, point.x, point.y + geometry.height / 2 + 12);
      }
    }
    this.drawStationedDrone(width, height, timeSeconds, excludedIds);
    return hits;
  }
  private drawStationedDrone(
    width: number,
    height: number,
    timeSeconds: number,
    excludedIds: ReadonlySet<string>
  ) {
    // In a player duel the native combat renderer owns the drone body.
    if (
      !isStationedDrone(this.model.combat?.defender.id) &&
      ![...excludedIds].some(isStationedDrone)
    ) {
      drawLocalSecurityDrone(
        this.context,
        this.camera,
        this.model.securityDrone,
        width,
        height,
        timeSeconds,
        localDroneShieldHits(this.model.npcCombats)
      );
    }
  }
  private drawNpcWork(
    npc: SalvageNpcShipView,
    point: ScreenPoint,
    geometry: ShipScreenGeometry,
    width: number,
    height: number,
    timeSeconds: number
  ): void {
    if (this.model.combat?.defender.id === npc.id) return;
    const wreck = npc.targetWreckId
      ? this.model.wrecks.find((entry) => entry.id === npc.targetWreckId)
      : null;
    if (!wreck) return;
    if (npc.phase === 'scanning') {
      this.drawNpcScan(
        point,
        wreck.position,
        wreck.radius,
        width,
        height,
        npc.scanProgress,
        timeSeconds
      );
    } else if (npc.salvageActive) {
      drawSalvageWorkEffect(
        this.context,
        this.camera,
        geometry,
        npc.hardpoints,
        wreck.position,
        false,
        0,
        width,
        height,
        timeSeconds
      );
    }
  }
  protected drawNpcScan(
    _shipPoint: ScreenPoint,
    targetWorld: { readonly x: number; readonly y: number },
    radius: number,
    width: number,
    height: number,
    progress: number,
    timeSeconds: number
  ): void {
    drawTargetDetailScan(
      this.context,
      this.camera.worldToScreen(targetWorld, width, height),
      Math.max(14, this.camera.scale(radius) + 9),
      progress,
      timeSeconds
    );
  }
}
