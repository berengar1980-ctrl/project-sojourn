import type { SalvageDebris, SalvageField, SalvageWreck } from '../../core/salvage-types';

type DriftBody = Pick<SalvageDebris, 'position' | 'radius' | 'driftVelocity' | 'rotation3d' | 'spin3d'>;

/** Shared O(1) per-object movement. No rigid-body solver, random calls or allocations for meshes. */
function advanceBody(body: DriftBody, width: number, height: number, dt: number): void {
  const margin = body.radius + 12;
  const lowX = margin;
  const highX = Math.max(lowX, width - margin);
  const lowY = margin;
  const highY = Math.max(lowY, height - margin);
  let vx = body.driftVelocity.x;
  let vy = body.driftVelocity.y;
  if (body.position.x + vx * dt < lowX || body.position.x + vx * dt > highX) vx = -vx;
  if (body.position.y + vy * dt < lowY || body.position.y + vy * dt > highY) vy = -vy;

  body.position = {
    x: Math.max(lowX, Math.min(highX, body.position.x + vx * dt)),
    y: Math.max(lowY, Math.min(highY, body.position.y + vy * dt)),
  };
  body.driftVelocity = { x: vx, y: vy };
  body.rotation3d = {
    x: (body.rotation3d.x + body.spin3d.x * dt) % (Math.PI * 2),
    y: (body.rotation3d.y + body.spin3d.y * dt) % (Math.PI * 2),
    z: (body.rotation3d.z + body.spin3d.z * dt) % (Math.PI * 2),
  };
}

/** Distress ships intentionally stay outside this motion system. */
export function advanceSalvageContainerDrift(field: SalvageField, deltaSeconds: number): void {
  const dt = Math.max(0, Math.min(0.05, deltaSeconds));
  if (dt <= 0) return;
  for (const wreck of field.wrecks) {
    if (!wreck.containerVariant || !wreck.driftVelocity || !wreck.rotation3d || !wreck.spin3d)
      continue;
    // Optional on legacy/special wrecks; the guard above guarantees required fields.
    advanceBody(wreck as Required<Pick<SalvageWreck, 'position' | 'radius' | 'driftVelocity' | 'rotation3d' | 'spin3d'>>, field.width, field.height, dt);
    wreck.rotation = wreck.rotation3d.z;
  }
  for (const fragment of field.debris ?? []) {
    advanceBody(fragment, field.width, field.height, dt);
  }
}
