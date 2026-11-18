import type { CombatBeamSnapshot } from '../../systems/combat/strategic-combat-types';
import { drawLegacyCombatBeam } from './combat-legacy-beam-renderer';
import { drawFluxProjectorPulse } from './combat-flux-projector-fx';
import { drawIonCannonArc, drawRailgunLance } from './combat-weapon-fx-renderer';
import {
  drawVisionFrontRepeater,
  drawVisionIonLaser,
  drawVisionPulseLaser,
} from './combat-weapon-vision-renderer';

interface BeamPoint {
  readonly x: number;
  readonly y: number;
}

/** One native weapon effect for standalone duels and both embedded field scenes. */
export function drawCombatBeamVisual(
  context: CanvasRenderingContext2D,
  beam: CombatBeamSnapshot,
  start: BeamPoint,
  end: BeamPoint
): void {
  const ageSeconds = Math.max(0, beam.maxTtlSeconds - beam.ttlSeconds);
  if (beam.family === 'flux_projector') {
    drawFluxProjectorPulse(context, start, end, ageSeconds);
  } else if (beam.family === 'front_repeater') {
    drawVisionFrontRepeater(context, start, end, ageSeconds);
  } else if (beam.family === 'pulse_laser') {
    drawVisionPulseLaser(context, start, end, ageSeconds);
  } else if (beam.family === 'ion_laser') {
    drawVisionIonLaser(context, start, end, ageSeconds, beam.id);
  } else if (beam.family === 'ion_cannon') {
    drawIonCannonArc(context, start, end, ageSeconds, beam.id);
  } else if (beam.family === 'railgun') {
    drawRailgunLance(context, start, end, ageSeconds);
  } else {
    drawLegacyCombatBeam(context, beam, start, end);
  }
}
