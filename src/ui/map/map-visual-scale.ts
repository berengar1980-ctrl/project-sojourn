function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function mapSymbolScale(relativeZoom: number): number {
  return clamp(Math.pow(relativeZoom, 0.62), 0.72, 2.5);
}

export function shipSymbolScale(relativeZoom: number): number {
  return clamp(Math.pow(relativeZoom, 0.45), 0.78, 1.95);
}

export function starMapShipWidth(
  nominalLengthMeters: number,
  relativeZoom: number
): number {
  const baseWidth = clamp(nominalLengthMeters * 0.22, 18, 28);
  return baseWidth * shipSymbolScale(relativeZoom);
}
