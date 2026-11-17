/**
 * Avoid repeating expensive, non-visual map reports on every draw. The simulation
 * remains authoritative and runs at its original cadence; only presentation
 * snapshots are cached. Keys must include any immediate invalidation inputs.
 */
export function createTimedMapReportCache<T>(minimumIntervalMs = 700) {
  const entries = new WeakMap<object, { key: string; at: number; value: T }>();
  return (owner: object, key: string, build: () => T, now = performance.now()): T => {
    const previous = entries.get(owner);
    if (previous && previous.key === key && now - previous.at < minimumIntervalMs) {
      return previous.value;
    }
    const value = build();
    entries.set(owner, { key, at: now, value });
    return value;
  };
}
