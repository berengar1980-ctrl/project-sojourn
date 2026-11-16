import type { LocalSpaceInstance } from '../../core/local-space-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { LocalMinerCheckpoint } from '../npcs/npc-mining-targets';
import type { LocalPirateCheckpoint } from '../npcs/npc-local-pirate-checkpoint';
import type { SecurityDroneCheckpoint } from './asteroid-security-drone-checkpoint';
import type { WorldLocation } from '../../core/world-types';
import { generateMiningSpace } from '../local-space/local-space-generator';
import type { NpcLocalMiningService } from '../npcs/npc-mining-targets';
import { LocalPirateTraffic } from '../npcs/npc-local-pirate-service';
import { hashId } from '../npcs/npc-mining-targets';
import { AsteroidSecurityDrone } from './asteroid-security-drone';
import type { AsteroidClaimRegistry } from './asteroid-claim-registry';

export interface AsteroidFieldRuntime {
  readonly locationId: string;
  readonly instance: LocalSpaceInstance;
  readonly miners: NpcLocalMiningService;
  readonly pirates: LocalPirateTraffic;
  readonly drone: AsteroidSecurityDrone;
}

type MinerFactory = (
  location: WorldLocation,
  instance: LocalSpaceInstance,
  checkpoint?: LocalMinerCheckpoint
) => NpcLocalMiningService;

export interface CareerAsteroidFieldCheckpoint {
  readonly version: 1;
  readonly backgroundAccumulator: number;
  readonly fields: Readonly<Record<string, {
    readonly miners: LocalMinerCheckpoint;
    readonly pirates: LocalPirateCheckpoint;
    readonly drone: SecurityDroneCheckpoint;
  }>>;
}

/**
 * One authoritative local world per mining location. Scene mounts reference the
 * same instance and NPC services; they never create an alternate field economy.
 */
export class AsteroidFieldWorld {
  private readonly fields = new Map<string, AsteroidFieldRuntime>();
  private backgroundAccumulator = 0;

  constructor(
    locations: readonly WorldLocation[],
    claims: AsteroidClaimRegistry,
    miners: MinerFactory,
    checkpoint?: CareerAsteroidFieldCheckpoint,
    npcs: readonly SectorNpcState[] = []
  ) {
    if (checkpoint) {
      if (
        checkpoint.version !== 1 ||
        !Number.isFinite(checkpoint.backgroundAccumulator) ||
        checkpoint.backgroundAccumulator < 0 ||
        checkpoint.backgroundAccumulator >= 0.25 ||
        !checkpoint.fields ||
        typeof checkpoint.fields !== 'object' ||
        Array.isArray(checkpoint.fields)
      ) {
        throw new Error('Invalid asteroid field checkpoint');
      }
      const ids = locations.filter((location) => location.activities.mine).map((item) => item.id);
      if (
        Object.keys(checkpoint.fields).length !== ids.length ||
        ids.some((id) => !Object.hasOwn(checkpoint.fields, id))
      ) {
        throw new Error('Asteroid field checkpoint locations mismatch');
      }
      this.backgroundAccumulator = checkpoint.backgroundAccumulator;
    }
    for (const location of locations) {
      if (!location.activities.mine) continue;
      const seed = claims.seedFor(location.id, () => hashId('sojourn-field:' + location.id));
      const instance = generateMiningSpace(location.id, seed, location.minedResourceIds);
      claims.restoreField(location.id, instance.asteroids);
      const saved = checkpoint?.fields[location.id];
      this.fields.set(location.id, {
        locationId: location.id,
        instance,
        miners: miners(location, instance, saved?.miners),
        pirates: saved
          ? LocalPirateTraffic.fromCheckpoint(
              instance.width, instance.height, seed, npcs, saved.pirates
            )
          : new LocalPirateTraffic(instance.width, instance.height, seed),
        drone: saved
          ? AsteroidSecurityDrone.fromCheckpoint(
              instance.width, instance.height, instance.asteroids, saved.drone
            )
          : new AsteroidSecurityDrone(instance.width, instance.height, instance.asteroids),
      });
    }
  }

  /** Capture every field, not only the currently mounted scene. */
  exportState(): CareerAsteroidFieldCheckpoint {
    const fields: Record<string, CareerAsteroidFieldCheckpoint['fields'][string]> = {};
    for (const [id, field] of this.fields) {
      fields[id] = {
        miners: field.miners.exportState(),
        pirates: field.pirates.exportState(),
        drone: field.drone.exportState(),
      };
    }
    return { version: 1, backgroundAccumulator: this.backgroundAccumulator, fields };
  }

  field(locationId: string): AsteroidFieldRuntime | null {
    return this.fields.get(locationId) ?? null;
  }

  /** Read authoritative fields for checkpoint capture, including offscreen ore. */
  forEachField(visit: (field: AsteroidFieldRuntime) => void): void {
    for (const field of this.fields.values()) visit(field);
  }

  /** Active maps use their frame delta; other fields advance in bounded steps. */
  tick(
    deltaSeconds: number,
    activeLocationId: string | null,
    onStep: (field: AsteroidFieldRuntime, seconds: number) => void
  ): void {
    const dt = Math.min(0.25, Math.max(0, deltaSeconds));
    if (dt <= 0) return;
    const active = activeLocationId ? this.fields.get(activeLocationId) : null;
    if (active) onStep(active, Math.min(dt, 0.08));
    this.backgroundAccumulator += dt;
    if (this.backgroundAccumulator < 0.25) return;
    this.backgroundAccumulator -= 0.25;
    for (const field of this.fields.values()) {
      if (field === active) continue;
      // The NPC mining physics already caps each step at 0.08s.
      for (let i = 0; i < 4; i++) onStep(field, 0.0625);
    }
  }
}
