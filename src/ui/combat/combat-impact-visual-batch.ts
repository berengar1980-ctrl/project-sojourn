import type { StrategicCombatSide } from '../../systems/combat/strategic-combat-service';
import type { VisibleCombatImpact, Point } from './strategic-combat-renderer-types';
import { drawVisionWeaponImpact } from './combat-weapon-vision-renderer';
import { weaponImpactView, clamp01 } from './strategic-combat-renderer-math';
import { drawStrategicHullImpact } from './strategic-hull-impact-effect';

/** Draw only still-visible physical impact events, independently of game time. */
export function drawCombatImpactBatch(
  context: CanvasRenderingContext2D,
  impacts: readonly VisibleCombatImpact[],
  elapsedSeconds: number,
  screen: (position: Point) => Point,
  shipHeight: (side: StrategicCombatSide) => number
): void {
  for (const visible of impacts) {
    const impact = visible.impact;
    const age = elapsedSeconds - visible.startedAt;
    if (age < 0) continue;
    const point = screen(impact.position);
    if (impact.weaponFamily && impact.layer !== 'miss') {
      const view = weaponImpactView(
        shipHeight(impact.target),
        impact.weaponFamily,
        impact.layer === 'shield'
      );
      context.save();
      context.beginPath();
      context.arc(point.x, point.y, view.radius, 0, Math.PI * 2);
      context.clip();
      context.translate(point.x, point.y);
      context.scale(view.scale, view.scale);
      drawVisionWeaponImpact(
        context,
        impact.weaponFamily,
        { x: 0, y: 0 },
        age,
        impact.serial,
        impact.layer === 'shield'
      );
      context.restore();
    } else {
      drawStrategicHullImpact(context, impact, clamp01(age / 0.7), point);
    }
  }
}
