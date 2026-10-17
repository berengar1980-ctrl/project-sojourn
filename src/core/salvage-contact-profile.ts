/**
 * Salvage objects are painted as projected 3D meshes with scale radius / 1.9.
 * Their nominal radius is the asset envelope, not a circular wall. An internal
 * contact disk follows the solid short-axis hull of each model class, leaving
 * projecting spars, broken framing and empty bays non-blocking.
 */
const SHORT_AXIS_HALF_EXTENT = {
  container: 0.8,
  debris: 0.7,
  section: 1.1,
} as const;

export type SalvageContactModel = keyof typeof SHORT_AXIS_HALF_EXTENT;

export function salvageSolidContactRadius(radius: number, model: SalvageContactModel): number {
  return radius * (SHORT_AXIS_HALF_EXTENT[model] / 1.9);
}
