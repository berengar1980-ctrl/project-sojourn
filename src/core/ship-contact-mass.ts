import { combatHullRadii, type ShieldWorldGeometry } from './ship-contact-geometry';

/** Resource-rock density is the shared 2D reference density for ship contacts. */
export const CONTACT_REFERENCE_DENSITY = 5.8;

export interface ShipContactMassProperties {
  readonly mass: number;
  readonly radiusX: number;
  readonly radiusY: number;
}

/** Derive effective mass from the structured, metric hull envelope, never sprite pixels. */
export function shipContactMassProperties(
  nominalLengthMeters: number,
  shield?: Pick<ShieldWorldGeometry, 'radiusX' | 'radiusY'>
): ShipContactMassProperties {
  const { radiusX, radiusY } = combatHullRadii(nominalLengthMeters, shield);
  const mass = Math.max(1, Math.PI * radiusX * radiusY * CONTACT_REFERENCE_DENSITY);
  return {
    mass,
    radiusX,
    radiusY,
  };
}

export function circularContactMass(radius: number): number {
  return Math.max(1, Math.PI * Math.max(0, radius) ** 2 * CONTACT_REFERENCE_DENSITY);
}
