function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function mapSymbolScale(relativeZoom: number): number {
  return clamp(Math.pow(relativeZoom, 0.8), 0.55, 3.2);
}

export function shipSymbolScale(relativeZoom: number): number {
  return clamp(Math.pow(relativeZoom, 0.8), 0.55, 2.6);
}
