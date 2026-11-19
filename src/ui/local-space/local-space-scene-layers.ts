import { drawMiningChunkVisual, type MiningEffectsRenderer } from './mining-effects-renderer';
import { drawFieldNpcThrusters } from '../combat/embedded-combat-thrusters';
import { drawEmbeddedCombatShipTelemetry } from '../combat/embedded-combat-ship-telemetry';
import type {
  LocalNpcShipView,
  LocalSpaceViewModel,
} from '../../features/local-space/local-space-view-model';
import { type MapCamera, type ScreenPoint } from '../map/map-camera';
import { type ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { type ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { type ShipLightingRenderer } from '../ships/ship-lighting-renderer';
export interface AsteroidHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}
export interface NpcHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}
export function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export abstract class LocalSpaceSceneLayers {
  protected abstract context: CanvasRenderingContext2D;
  protected abstract model: LocalSpaceViewModel;
  protected abstract camera: MapCamera;
  protected abstract ensureNpcImage(url: string): HTMLImageElement;
  protected abstract engineEffects: ShipEngineEffectsRenderer;
  protected abstract miningEffects: MiningEffectsRenderer;
  protected abstract shipLighting: ShipLightingRenderer;
  protected abstract shieldImpacts: ShieldImpactRenderer;
  protected abstract shipGeometry(width: number, height: number): ShipScreenGeometry;
  protected drawNpcSelection(point: ScreenPoint, geometry: ShipScreenGeometry): void {
    this.context.save();
    this.context.strokeStyle = 'rgba(235, 91, 76, .95)';
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
  protected drawPirateMarker(point: ScreenPoint, geometry: ShipScreenGeometry): void {
    // Always identify corsairs, even below the regular NPC-name zoom threshold.
    this.context.save();
    this.context.fillStyle = '#e6a36a';
    this.context.font = 'bold 10px ui-monospace, monospace';
    this.context.textAlign = 'center';
    this.context.fillText(
      'KORSAR',
      point.x,
      point.y - Math.max(geometry.width, geometry.height) * 0.5 - 10
    );
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
        'mining'
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
        this.context.fillStyle = '#8597a1';
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
        'mining'
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
      if (npc.isPirate) this.drawPirateMarker(point, geometry);

      this.drawNpcWorkEffects(npc, point, geometry, width, height, timeSeconds);

      const zoom = this.camera.getRelativeZoom();
      if (zoom >= 1.55) {
        this.context.fillStyle = 'rgba(184, 210, 216, .78)';
        this.context.font = '9px ui-monospace, monospace';
        this.context.textAlign = 'center';
        this.context.fillText(npc.name, point.x, point.y + geometry.height / 2 + 12);
      }
    }
    return hits;
  }
  private drawNpcWorkEffects(
    npc: LocalNpcShipView,
    point: ScreenPoint,
    geometry: ShipScreenGeometry,
    width: number,
    height: number,
    timeSeconds: number
  ): void {
    // Combatants never retain a mining beam during PvP.
    if (!npc.targetAsteroidId || this.model.combat?.defender.id === npc.id) return;
    const target = this.model.asteroids.find((rock) => rock.id === npc.targetAsteroidId);
    if (!target) return;
    if (npc.phase === 'scanning') {
      this.drawNpcMinerScan(
        point,
        target.position,
        width,
        height,
        npc.scanProgress ?? 0,
        timeSeconds
      );
    } else if (npc.laserActive) {
      this.miningEffects.drawNpcMining(
        this.model,
        npc,
        target,
        geometry,
        width,
        height,
        timeSeconds
      );
    }
  }
  protected drawNpcMinerScan(
    _shipPoint: ScreenPoint,
    targetWorld: { readonly x: number; readonly y: number },
    width: number,
    height: number,
    progress: number,
    timeSeconds: number
  ): void {
    const target = this.camera.worldToScreen(targetWorld, width, height);
    const radius = 10 + progress * 28;
    this.context.save();
    this.context.strokeStyle = `rgba(116, 235, 248, ${0.52 + Math.sin(timeSeconds * 10) * 0.16})`;
    this.context.lineWidth = 1.2;
    this.context.beginPath();
    this.context.arc(target.x, target.y, radius, 0, Math.PI * 2);
    this.context.stroke();
    // A scan is an expanding pulse at the rock, not a permanent blue tow line.
    this.context.beginPath();
    this.context.arc(target.x, target.y, radius * 0.48, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
  }
  protected drawChunks(width: number, height: number): void {
    for (const chunk of this.model.chunks) {
      const point = this.camera.worldToScreen(chunk.position, width, height);
      if (point.x < -8 || point.y < -8 || point.x > width + 8 || point.y > height + 8) continue;
      drawMiningChunkVisual(this.context, point, chunk.id);
    }
  }
}
