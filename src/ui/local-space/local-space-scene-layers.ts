import { drawCombatPlayerMarker } from '../combat/combat-ship-detail-renderer';
import { DEFAULT_COMBAT_DISPLAY, type FleetDisplayPreferences } from '../combat/fleet-display-menu';
import { drawPirateInsignia } from '../ships/pirate-insignia-renderer';
import { drawFieldShipSprite } from '../ships/field-ship-sprite';
import { drawFieldEscort } from './local-security-drone-visual';
import type { PvPMapCamera } from '../combat/pvp-map-camera';
import { drawNpcMinerScan } from '../local-operations/scan-effects';
import { drawMiningChunkVisual, type MiningEffectsRenderer } from './mining-effects-renderer';
import { drawFieldNpcThrusters } from '../combat/embedded-combat-thrusters';
import { drawEmbeddedCombatShipTelemetry } from '../combat/embedded-combat-ship-telemetry';
import type {
  LocalNpcShipView,
  LocalSpaceViewModel,
} from '../../features/local-space/local-space-view-model';
import { type ScreenPoint } from '../map/map-camera';
import { type ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { type ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
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
export { hashId } from './local-space-visual-hash';
export abstract class LocalSpaceSceneLayers {
  protected combatDisplay: FleetDisplayPreferences = DEFAULT_COMBAT_DISPLAY;
  protected abstract context: CanvasRenderingContext2D;
  protected abstract model: LocalSpaceViewModel;
  protected abstract camera: PvPMapCamera;
  protected abstract ensureNpcImage(url: string): HTMLImageElement;
  protected abstract engineEffects: ShipEngineEffectsRenderer;
  protected abstract miningEffects: MiningEffectsRenderer;
  protected abstract shipLighting: ShipLightingRenderer;
  protected abstract shieldImpacts: ShieldImpactRenderer;
  protected abstract shipGeometry(width: number, height: number): ShipScreenGeometry;
  protected drawPlayerCombatAnnotations(geometry: ShipScreenGeometry): void {
    if (this.model.combat)
      drawEmbeddedCombatShipTelemetry(
        this.context,
        this.model.combat.attacker,
        geometry,
        this.combatDisplay
      );
    if (this.combatDisplay.playerMarker) drawCombatPlayerMarker(this.context, geometry);
  }
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
        this.model.combat?.defender.id === npc.id
          ? this.model.combat.defender
          : (this.model.npcCombats
              ?.flatMap((duel) => [duel.attacker, duel.defender])
              .find((combatant) => combatant.id === npc.id) ?? null);
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
      drawFieldShipSprite(
        this.context,
        this.shipLighting,
        image,
        npc.hardpoints,
        geometry,
        '#8597a1'
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
      if (combatDefender)
        drawEmbeddedCombatShipTelemetry(this.context, combatDefender, geometry, this.combatDisplay);

      hits.push({
        id: npc.id,
        point,
        radius: Math.max(18, Math.max(geometry.width, geometry.height) * 0.6),
      });
      if (npc.pirateMark) drawPirateInsignia(this.context, npc.pirateMark, geometry);
      if (npc.isSelected) this.drawNpcSelection(point, geometry);
      if (npc.isPirate && this.combatDisplay.names) this.drawPirateMarker(point, geometry);

      this.drawNpcWorkEffects(npc, point, geometry, width, height, timeSeconds);

      const zoom = this.camera.getRelativeZoom();
      if (this.combatDisplay.names && zoom >= 1.55) {
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
    const fighting = this.model.npcCombats?.some(
      (duel) => duel.attacker.id === npc.id || duel.defender.id === npc.id
    );
    if (!npc.targetAsteroidId || this.model.combat?.defender.id === npc.id || fighting) return;
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
      this.miningEffects.drawNpcMining(npc, target, geometry, width, height, timeSeconds);
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
    drawNpcMinerScan(this.context, target, progress, timeSeconds);
  }
  protected drawChunks(width: number, height: number): void {
    for (const chunk of this.model.chunks) {
      const point = this.camera.worldToScreen(chunk.position, width, height);
      if (point.x < -8 || point.y < -8 || point.x > width + 8 || point.y > height + 8) continue;
      drawMiningChunkVisual(this.context, point, chunk.id);
    }
  }
}
