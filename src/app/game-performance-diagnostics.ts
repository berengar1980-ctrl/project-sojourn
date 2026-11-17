/**
 * Opt-in diagnostics. Add ?perf=1 to the game URL, reproduce the lag, then
 * inspect window.sojournPerf.report() in the browser developer console.
 * Never stores measurements in save files or localStorage.
 */
export interface PerformanceSample {
  readonly name: string;
  readonly count: number;
  readonly averageMs: number;
  readonly maximumMs: number;
  readonly totalMs: number;
  readonly over50ms: number;
}
interface MutableSample {
  count: number;
  totalMs: number;
  maximumMs: number;
  over50ms: number;
}
const samples = new Map<string, MutableSample>();
const enabled =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('perf') === '1';

export function recordPerformance(name: string, durationMs: number): void {
  if (!enabled || !Number.isFinite(durationMs) || durationMs < 0) return;
  const entry = samples.get(name) ?? { count: 0, totalMs: 0, maximumMs: 0, over50ms: 0 };
  entry.count += 1;
  entry.totalMs += durationMs;
  entry.maximumMs = Math.max(entry.maximumMs, durationMs);
  if (durationMs >= 50) entry.over50ms += 1;
  samples.set(name, entry);
}

export function measurePerformance<T>(name: string, work: () => T): T {
  if (!enabled) return work();
  const start = performance.now();
  try {
    return work();
  } finally {
    recordPerformance(name, performance.now() - start);
  }
}

export function performanceReport(): readonly PerformanceSample[] {
  return [...samples.entries()]
    .map(([name, entry]) => ({
      name,
      count: entry.count,
      averageMs: Number((entry.totalMs / entry.count).toFixed(2)),
      maximumMs: Number(entry.maximumMs.toFixed(2)),
      totalMs: Number(entry.totalMs.toFixed(2)),
      over50ms: entry.over50ms,
    }))
    .sort((a, b) => b.maximumMs - a.maximumMs);
}

export function resetPerformanceReport(): void {
  samples.clear();
}

if (enabled) {
  // Deliberately limited to an opt-in diagnostic URL; no network telemetry.
  Object.assign(window, {
    sojournPerf: {
      report: () => performanceReport(),
      reset: () => resetPerformanceReport(),
      print: () => console.table(performanceReport()),
    },
  });
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          recordPerformance('browser.long-task', entry.duration);
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // The browser may not support Long Tasks; timing probes still work.
    }
  }
  console.info(
    '[Sojourn Perf] Diagnostics active. Use window.sojournPerf.print(), .report(), or .reset().'
  );
}
