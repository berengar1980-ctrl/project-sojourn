import type { SalvageField } from '../../core/salvage-types';

/** Advance only procedural cargo containers. A distress-rescue ship is never modified. */
export function advanceSalvageContainerDrift(field: SalvageField, deltaSeconds: number): void {
  const dt = Math.max(0, Math.min(0.05, deltaSeconds));
  if (dt <= 0) return;
  for (const wreck of field.wrecks) {
    if (!wreck.containerVariant || !wreck.driftVelocity || !wreck.rotation3d || !wreck.spin3d)
      continue;
    const margin = wreck.radius + 12;
    const lowX = margin, highX = Math.max(lowX, field.width - margin);
    const lowY = margin, highY = Math.max(lowY, field.height - margin);
    let vx = wreck.driftVelocity.x, vy = wreck.driftVelocity.y;
    const candidateX = wreck.position.x + vx * dt;
    const candidateY = wreck.position.y + vy * dt;
    if (candidateX < lowX || candidateX > highX) vx = -vx;
    if (candidateY < lowY || candidateY > highY) vy = -vy;
    wreck.position = {
      x: Math.max(lowX, Math.min(highX, wreck.position.x + vx * dt)),
      y: Math.max(lowY, Math.min(highY, wreck.position.y + vy * dt)),
    };
    wreck.driftVelocity = { x: vx, y: vy };
    wreck.rotation3d = {
      x: (wreck.rotation3d.x + wreck.spin3d.x * dt) % (Math.PI * 2),
      y: (wreck.rotation3d.y + wreck.spin3d.y * dt) % (Math.PI * 2),
      z: (wreck.rotation3d.z + wreck.spin3d.z * dt) % (Math.PI * 2),
    };
    wreck.rotation = wreck.rotation3d.z;
  }
}
