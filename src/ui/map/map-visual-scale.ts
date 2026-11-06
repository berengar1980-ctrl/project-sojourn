function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function mapSymbolScale(relativeZoom: number): number {
  return clamp(Math.pow(relativeZoom, 0.62), 0.72, 2.5);
}

export function shipSymbolScale(relativeZoom: number): number {
  return clamp(Math.pow(relativeZoom, 0.45), 0.78, 1.95);
}

export function starMapShipWidth(nominalLengthMeters: number, relativeZoom: number): number {
  const baseWidth = clamp(nominalLengthMeters * 0.22, 18, 28);
  return baseWidth * shipSymbolScale(relativeZoom);
}

/** Exactly the same radius for a rendered body and its ship holding ring. */
export function mapLocationVisualRadius(
  location: { readonly kind: string; readonly radius: number },
  relativeZoom: number
): number {
  const radius =
    location.kind === 'asteroid-field'
      ? 24
      : location.kind === 'station'
        ? Math.min(18, Math.max(10, location.radius * 0.72))
        : location.kind === 'wreck'
          ? 9
          : location.kind === 'moon'
            ? Math.min(12, Math.max(4, location.radius * 0.65))
            : Math.min(30, Math.max(8, location.radius * 0.55));
  return radius * mapSymbolScale(relativeZoom);
}
