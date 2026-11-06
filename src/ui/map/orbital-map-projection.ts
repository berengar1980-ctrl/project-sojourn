import type { WorldPoint } from '../../core/world-types';
import type { StarMapLocationView } from '../../features/star-map/star-map-view-model';
import type { ScreenPoint } from './map-camera';
import { mapLocationVisualRadius } from './map-visual-scale';

export interface MapProjectionCamera {
  worldToScreen(point: WorldPoint, width: number, height: number): ScreenPoint;
  getRelativeZoom(): number;
}

export interface OrbitalMapContact {
  readonly id: string;
  readonly position: WorldPoint;
  readonly locationId?: string | null;
  readonly shipWidth: number;
  readonly stationary: boolean;
}

interface OrbitTransition {
  readonly stationary: boolean;
  readonly from: number;
  readonly changedAt: number;
}

const ORBIT_TRANSITION_MS = 550;
const ORBIT_OUTLINE_OFFSET = 9;
const SHIP_GAP = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** One transition per ship; never stores camera-dependent screen positions. */
export class OrbitalMapTransitions {
  private readonly transitions = new Map<string, OrbitTransition>();
  private readonly priorAngles = new Map<string, number>();

  blend(id: string, stationary: boolean, nowMs: number): number {
    let state = this.transitions.get(id);
    if (!state) {
      state = { stationary, from: stationary ? 1 : 0, changedAt: nowMs };
      this.transitions.set(id, state);
    } else if (state.stationary !== stationary) {
      const previous = this.value(state, nowMs);
      state = { stationary, from: previous, changedAt: nowMs };
      this.transitions.set(id, state);
    }
    return this.value(state, nowMs);
  }

  angle(id: string, assignedAngle: number | undefined): number | undefined {
    if (assignedAngle !== undefined) this.priorAngles.set(id, assignedAngle);
    return assignedAngle ?? this.priorAngles.get(id);
  }

  reset(): void {
    this.transitions.clear();
    this.priorAngles.clear();
  }

  private value(state: OrbitTransition, nowMs: number): number {
    const progress = clamp((nowMs - state.changedAt) / ORBIT_TRANSITION_MS, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const destination = state.stationary ? 1 : 0;
    return state.from + (destination - state.from) * eased;
  }
}

/** The visible ship's INNER edge sits just beyond the selected location ring. */
export function orbitalMapShipRadius(
  location: StarMapLocationView,
  relativeZoom: number,
  shipWidth: number
): number {
  const bodyRadius = mapLocationVisualRadius(location, relativeZoom);
  return bodyRadius + ORBIT_OUTLINE_OFFSET + shipWidth * 0.5 + SHIP_GAP;
}

interface OrbitalAngle {
  readonly contact: OrbitalMapContact;
  readonly angle: number;
}

function separateOrbitalContacts(
  ordered: readonly OrbitalAngle[],
  placed: number[],
  location: StarMapLocationView,
  relativeZoom: number
): void {
  const maxSeparation = (Math.PI * 2 * 0.85) / ordered.length;
  for (let round = 0; round < 18; round += 1) {
    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const left = ordered[i]!.contact;
        const right = ordered[j]!.contact;
        const radius = Math.min(
          orbitalMapShipRadius(location, relativeZoom, left.shipWidth),
          orbitalMapShipRadius(location, relativeZoom, right.shipWidth)
        );
        const minimum = Math.min(
          maxSeparation,
          (left.shipWidth * 0.5 + right.shipWidth * 0.5 + SHIP_GAP) / radius
        );
        const difference = Math.atan2(
          Math.sin(placed[j]! - placed[i]!),
          Math.cos(placed[j]! - placed[i]!)
        );
        if (Math.abs(difference) >= minimum) continue;
        const direction = difference < 0 ? -1 : 1;
        const correction = (minimum - Math.abs(difference)) * 0.5;
        placed[i] = placed[i]! - direction * correction;
        placed[j] = placed[j]! + direction * correction;
      }
    }
  }
}

/**
 * Resolve multiple visible stationary contacts along one visual ring.
 * Their identifiers, world coordinates and routes are not changed.
 */
export function layoutOrbitalShipAngles(
  contacts: readonly OrbitalMapContact[],
  locations: readonly StarMapLocationView[],
  relativeZoom: number
): ReadonlyMap<string, number> {
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const groups = new Map<string, OrbitalMapContact[]>();
  for (const contact of contacts) {
    const location = locationById.get(contact.locationId ?? '');
    if (!contact.stationary || !location) continue;
    if (!['planet', 'moon', 'station'].includes(location.kind)) continue;
    const group = groups.get(location.id) ?? [];
    group.push(contact);
    groups.set(location.id, group);
  }

  const angles = new Map<string, number>();
  for (const [id, contactsAtLocation] of groups) {
    const location = locationById.get(id)!;
    const ordered = contactsAtLocation
      .map((contact) => ({
        contact,
        angle: Math.atan2(
          contact.position.y - location.position.y,
          contact.position.x - location.position.x
        ),
      }))
      .sort((first, second) => {
        const difference = first.angle - second.angle;
        return difference || first.contact.id.localeCompare(second.contact.id);
      });
    const placed = ordered.map((entry) => entry.angle);
    separateOrbitalContacts(ordered, placed, location, relativeZoom);
    for (let i = 0; i < ordered.length; i += 1) {
      angles.set(ordered[i]!.contact.id, placed[i]!);
    }
  }
  return angles;
}

/**
 * Schematic orbital positions are independent of zoom, even at max zoom.
 * A short time-based blend prevents arrival/departure jumps and is derived
 * afresh from the current camera on every redraw (including during zoom).
 */
export function projectOrbitalMapShip(
  worldPosition: WorldPoint,
  location: StarMapLocationView | undefined,
  camera: MapProjectionCamera,
  viewportWidth: number,
  viewportHeight: number,
  shipWidth: number,
  stationary: boolean,
  orbitalBlend = stationary ? 1 : 0,
  assignedAngle?: number
): ScreenPoint {
  const physical = camera.worldToScreen(worldPosition, viewportWidth, viewportHeight);
  const blend = clamp(orbitalBlend, 0, 1);
  if (blend <= 0 || !location || !['planet', 'moon', 'station'].includes(location.kind)) {
    return physical;
  }

  const deltaX = worldPosition.x - location.position.x;
  const deltaY = worldPosition.y - location.position.y;
  if (Math.hypot(deltaX, deltaY) < 0.001 && assignedAngle === undefined) {
    return physical;
  }

  const center = camera.worldToScreen(location.position, viewportWidth, viewportHeight);
  const angle = assignedAngle ?? Math.atan2(deltaY, deltaX);
  const radius = orbitalMapShipRadius(location, camera.getRelativeZoom(), shipWidth);
  const target = {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
  return {
    x: physical.x + (target.x - physical.x) * blend,
    y: physical.y + (target.y - physical.y) * blend,
  };
}
