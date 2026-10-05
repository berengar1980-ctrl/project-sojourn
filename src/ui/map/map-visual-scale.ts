import type { LocationKind } from '../../core/world-types';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function mapSymbolScale(relativeZoom: number): number {
  return clamp(Math.pow(relativeZoom, 0.8), 0.55, 3.2);
}

export function shipSymbolScale(relativeZoom: number): number {
  return clamp(Math.pow(relativeZoom, 0.8), 0.55, 2.6);
}

export function mapLocationVisualRadius(kind: LocationKind, configuredRadius: number): number {
  if (kind === 'asteroid-field') return 30;
  if (kind === 'station') return clamp(configuredRadius * 0.72, 9, 17);
  if (kind === 'wreck') return 11;
  if (kind === 'moon') return clamp(configuredRadius * 0.9, 5, 20);
  return clamp(configuredRadius * 0.75, 12, 70);
}
