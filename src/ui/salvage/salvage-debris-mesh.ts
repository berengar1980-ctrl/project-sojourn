import type { SalvageDebris, SalvageDebrisVariant } from '../../core/salvage-types';
import { ContainerMesh, drawProjectedSalvageMesh, type Face } from './salvage-container-mesh';
import {
  buildBulkhead,
  buildEngine,
  buildHabitation,
  buildReactor,
} from './salvage-debris-equipment-meshes';
import {
  buildAirlock,
  buildCorridor,
  buildDeck,
  buildTruss,
} from './salvage-debris-structure-meshes';
import { drawCachedSalvageMesh } from './salvage-mesh-lod-cache';

// Eight distinct reusable 3D meshes: beams, torn plating, open floors, pipes,
// doors and loose power conduits. Built once; instances only carry pose.
function makeMesh(variant: SalvageDebrisVariant): readonly Face[] {
  const mesh = new ContainerMesh();
  switch (variant) {
    case 'corridor':
      buildCorridor(mesh);
      break;
    case 'deck':
      buildDeck(mesh);
      break;
    case 'airlock':
      buildAirlock(mesh);
      break;
    case 'truss':
      buildTruss(mesh);
      break;
    case 'engine':
      buildEngine(mesh);
      break;
    case 'reactor':
      buildReactor(mesh);
      break;
    case 'bulkhead':
      buildBulkhead(mesh);
      break;
    case 'habitation':
      buildHabitation(mesh);
      break;
  }
  return mesh.faces;
}

const cached: Readonly<Record<SalvageDebrisVariant, readonly Face[]>> = {
  corridor: makeMesh('corridor'),
  deck: makeMesh('deck'),
  airlock: makeMesh('airlock'),
  truss: makeMesh('truss'),
  engine: makeMesh('engine'),
  reactor: makeMesh('reactor'),
  bulkhead: makeMesh('bulkhead'),
  habitation: makeMesh('habitation'),
};

function effects(
  context: CanvasRenderingContext2D,
  part: Pick<SalvageDebris, 'variant' | 'rotation3d' | 'effectSeed'>,
  radius: number,
  timeSeconds: number
): void {
  const seed = part.effectSeed;
  // Deterministic short-circuit bursts; no particle allocations or persistent emitters.
  const phase = (timeSeconds * 0.68 + seed * 0.000041) % 3.7;
  const sparkPulse = phase > 2.92 && phase < 3.22;
  const angle = part.rotation3d.z;
  const x = Math.cos(angle) * radius * 0.19;
  const y = -Math.sin(angle) * radius * 0.19;
  if (sparkPulse) {
    context.save();
    context.translate(x, y);
    context.strokeStyle = 'rgba(121, 211, 255, 0.96)';
    context.lineWidth = 1.1;
    for (let i = 0; i < 5; i += 1) {
      const a = (i * 2.399 + seed * 0.019 + timeSeconds * 0.31) % (Math.PI * 2);
      const len = Math.min(8, 2 + radius * 0.15 + (i % 3));
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      context.stroke();
    }
    context.fillStyle = '#f7f1da';
    context.fillRect(-1.1, -1.1, 2.2, 2.2);
    context.restore();
  }

  // Only five of eight variants vent gas. The smoke is six translucent 2D
  // puffs attached to a rupture, not a full physics-based particle simulation.
  if (part.variant === 'deck' || part.variant === 'truss' || part.variant === 'bulkhead') return;
  const breathe = 0.57 + 0.19 * Math.sin(timeSeconds * 0.92 + seed * 0.01);
  context.save();
  context.translate(-x, -y);
  context.rotate(angle + 0.43);
  for (let i = 0; i < 6; i += 1) {
    const shift = (timeSeconds * 0.36 + i / 6 + seed * 0.00003) % 1;
    const spread = radius * (0.16 + shift * 0.7);
    const puffRadius = Math.max(1, radius * (0.035 + 0.12 * shift));
    context.fillStyle = `rgba(174, 198, 208, ${(1 - shift) * breathe * 0.13})`;
    context.beginPath();
    context.arc(spread, Math.sin(i * 2.1 + seed) * puffRadius * 0.55, puffRadius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export function drawSalvageDebris3d(
  context: CanvasRenderingContext2D,
  part: Pick<SalvageDebris, 'variant' | 'rotation3d' | 'effectSeed'>,
  radius: number,
  timeSeconds: number
): void {
  const mesh = cached[part.variant];
  if (
    radius >= 27 ||
    !drawCachedSalvageMesh(context, 'debris:' + part.variant, mesh, radius, part.rotation3d, 192)
  ) {
    drawProjectedSalvageMesh(context, mesh, radius, part.rotation3d);
  }
  if (radius >= 16) effects(context, part, radius, timeSeconds);
}
