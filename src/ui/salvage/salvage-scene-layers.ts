import { drawSalvageWorkEffect } from './salvage-work-effect-renderer';
import { drawFieldNpcThrusters } from '../combat/embedded-combat-thrusters';
import { drawEmbeddedCombatShipTelemetry } from '../combat/embedded-combat-ship-telemetry';
import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import { type MapCamera, type ScreenPoint } from '../map/map-camera';
import { drawLocalSpaceExitGate } from '../map/local-space-exit-gate';
import { type ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { type ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
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
  protected abstract camera: MapCamera;
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
      this.context.save();
      this.context.translate(point.x, point.y);
      this.context.rotate(npc.headingRadians);
      if (image.complete && image.naturalWidth > 0) {
        const offset = spriteDrawOffset(npc.hardpoints, geometry);
        this.shipLighting.draw(this.context, {
          image,
          width: geometry.width,
          height: geometry.height,
          angle: npc.headingRadians,
          light: { x: -0.72, y: -0.56 },
          offsetX: offset.x,
          offsetY: offset.y,
          directionalStrength: 2.05,
        });
      } else {
        this.context.fillStyle = '#8e999f';
        this.context.fillRect(-shipWidth / 2, -geometry.height / 2, shipWidth, geometry.height);
      }
      this.context.restore();
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
      if (npc.isSelected) this.drawNpcSelection(point, geometry);

      const wreck = npc.targetWreckId
        ? this.model.wrecks.find((entry) => entry.id === npc.targetWreckId)
        : null;
      if (wreck && npc.phase === 'scanning') {
        this.drawNpcScan(point, wreck.position, width, height, npc.scanProgress, timeSeconds);
      } else if (wreck && npc.salvageActive && !combatDefender) {
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

      if (this.camera.getRelativeZoom() >= 1.55) {
        this.context.fillStyle = 'rgba(215, 202, 168, 0.8)';
        this.context.font = '9px ui-monospace, monospace';
        this.context.textAlign = 'center';
        this.context.fillText(npc.name, point.x, point.y + geometry.height / 2 + 12);
      }
    }
    return hits;
  }
  protected drawNpcScan(
    shipPoint: ScreenPoint,
    targetWorld: { readonly x: number; readonly y: number },
    width: number,
    height: number,
    progress: number,
    timeSeconds: number
  ): void {
    const target = this.camera.worldToScreen(targetWorld, width, height);
    const radius = 12 + progress * 24;
    this.context.save();
    this.context.strokeStyle = `rgba(119, 226, 240, ${0.5 + Math.sin(timeSeconds * 10) * 0.18})`;
    this.context.lineWidth = 1.2;
    this.context.beginPath();
    this.context.arc(target.x, target.y, radius, 0, Math.PI * 2);
    this.context.stroke();
    this.context.setLineDash([4, 5]);
    this.context.beginPath();
    this.context.moveTo(shipPoint.x, shipPoint.y);
    this.context.lineTo(target.x, target.y);
    this.context.stroke();
    this.context.restore();
  }
}
