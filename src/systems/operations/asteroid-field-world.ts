import type { LocalSpaceInstance } from '../../core/local-space-types';
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

type MinerFactory = (location: WorldLocation, instance: LocalSpaceInstance) => NpcLocalMiningService;

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
    miners: MinerFactory
  ) {
    for (const location of locations) {
      if (!location.activities.mine) continue;
      const seed = claims.seedFor(location.id, () => hashId('sojourn-field:' + location.id));
      const instance = generateMiningSpace(location.id, seed, location.minedResourceIds);
      claims.restoreField(location.id, instance.asteroids);
      this.fields.set(location.id, {
        locationId: location.id,
        instance,
        miners: miners(location, instance),
        pirates: new LocalPirateTraffic(instance.width, instance.height, seed),
        drone: new AsteroidSecurityDrone(instance.width, instance.height, instance.asteroids),
      });
    }
  }

  field(locationId: string): AsteroidFieldRuntime | null {
    return this.fields.get(locationId) ?? null;
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
