import type { LocalAsteroid, LocalSpaceInstance } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { runLongRangeAsteroidScan } from './local-space-scanning';
import { updateIdleStationKeeping, type IdleStationKeepingState } from './local-space-station-keeping';

/** Own the local long- and short-range sensor clocks independently from navigation. */
export class LocalSpaceScanClock {
  private longElapsed = 0;
  private shortElapsed = 0;
  private longParameters: { readonly sensorModifier: number; readonly crewSkill: number } | null = null;

  constructor(private readonly instance: LocalSpaceInstance) {}

  longProgress(): number | null {
    return this.longParameters ? Math.min(1, this.longElapsed / 5) : null;
  }

  shortProgress(scanning: boolean): number | null {
    return scanning ? Math.min(1, this.shortElapsed / 5) : null;
  }

  beginLong(sensorModifier: number, crewSkill: number): void {
    if (this.longParameters) return;
    this.longElapsed = 0;
    this.longParameters = { sensorModifier, crewSkill };
  }

  advanceLong(seconds: number): void {
    if (!this.longParameters) return;
    this.longElapsed += seconds;
    if (this.longElapsed < 5) return;
    runLongRangeAsteroidScan(this.instance, this.longParameters.sensorModifier, this.longParameters.crewSkill);
    this.longElapsed = 0;
    this.longParameters = null;
  }

  resetShort(): void {
    this.shortElapsed = 0;
  }

  advanceShort(
    seconds: number,
    asteroid: LocalAsteroid,
    idle: IdleStationKeepingState,
    station: WorldPoint
  ): boolean {
    this.shortElapsed += seconds;
    updateIdleStationKeeping(idle, this.instance.ship, station, this.instance.seed, seconds);
    if (this.shortElapsed < 5) return false;
    asteroid.scanLevel = 'analyzed';
    for (const deposit of asteroid.deposits) deposit.identified = true;
    return true;
  }
}
