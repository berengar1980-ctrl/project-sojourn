import { isCombatWreckVariant } from '../../core/combat-wreck-variant';
import type { LocalAsteroid, LocalSpaceInstance, MiningChunk } from '../../core/local-space-types';
import type { SalvageField, SalvageWreck } from '../../core/salvage-types';
import {
  advanceSalvageContainerDrift,
  invalidateSalvagePhysics,
  salvageFieldPhysicsBodies,
  syncSalvagePhysicsContacts,
} from '../salvage/salvage-container-motion';
import type { SectorNpcState } from '../../core/npc-types';
import type { LocalMinerCheckpoint } from '../npcs/npc-mining-targets';
import { cloneCareerJson } from '../persistence/career-save-contract';
import type { LocalPirateCheckpoint } from '../npcs/npc-local-pirate-checkpoint';
import type { SecurityDroneCheckpoint } from './asteroid-security-drone-checkpoint';
import type { WorldLocation } from '../../core/world-types';
import { generateMiningSpace } from '../local-space/local-space-generator';
import type { NpcLocalMiningService } from '../npcs/npc-mining-targets';
import { LocalPirateTraffic } from '../npcs/npc-local-pirate-service';
import { hashId } from '../npcs/npc-mining-targets';
import { AsteroidSecurityDrone } from './asteroid-security-drone';
import type { AsteroidClaimRegistry } from './asteroid-claim-registry';

const COMBAT_WRECK_LIFETIME_SECONDS = 600;

export interface AsteroidFieldRuntime {
  readonly locationId: string;
  readonly instance: LocalSpaceInstance;
  readonly combatWrecks: readonly SalvageWreck[];
  readonly miners: NpcLocalMiningService;
  readonly pirates: LocalPirateTraffic;
  readonly drone: AsteroidSecurityDrone;
}

export type CareerMinerFactory = (
  location: WorldLocation,
  instance: LocalSpaceInstance,
  checkpoint?: LocalMinerCheckpoint
) => NpcLocalMiningService;

export interface CareerAsteroidFieldCheckpoint {
  readonly version: 1;
  readonly backgroundAccumulator: number;
  readonly combatWrecksByLocation?: Readonly<Record<string, readonly SalvageWreck[]>>;
  readonly fields: Readonly<
    Record<
      string,
      {
        readonly miners: LocalMinerCheckpoint;
        readonly pirates: LocalPirateCheckpoint;
        readonly drone: SecurityDroneCheckpoint;
        readonly chunks?: readonly MiningChunk[];
      }
    >
  >;
}

/**
 * One authoritative local world per mining location. Scene mounts reference the
 * same instance and NPC services; they never create an alternate field economy.
 */
function restoredCombatWrecks(
  locations: readonly WorldLocation[],
  saved: CareerAsteroidFieldCheckpoint['combatWrecksByLocation']
): Map<string, SalvageWreck[]> {
  const restored = new Map<string, SalvageWreck[]>();
  for (const [id, wrecks] of Object.entries(saved ?? {})) {
    if (
      (!locations.some((location) => location.id === id) &&
        !id.startsWith('salvage-special-') &&
        !id.startsWith('salvage-distress-')) ||
      !Array.isArray(wrecks) ||
      wrecks.length > 512 ||
      wrecks.some(
        (wreck) =>
          !wreck.id.startsWith('combat-wreck-') ||
          !wreck.combatWreckVariant ||
          !isCombatWreckVariant(wreck.combatWreckVariant) ||
          (wreck.remainingLifetimeSeconds !== undefined &&
            (!Number.isFinite(wreck.remainingLifetimeSeconds) ||
              wreck.remainingLifetimeSeconds < 0 ||
              wreck.remainingLifetimeSeconds > COMBAT_WRECK_LIFETIME_SECONDS)) ||
          !Number.isFinite(wreck.position.x) ||
          !Number.isFinite(wreck.position.y) ||
          !Array.isArray(wreck.resources) ||
          wreck.resources.some(
            (resource: SalvageWreck['resources'][number]) =>
              !Number.isFinite(resource.remainingAmount)
          )
      )
    )
      throw new Error('Invalid saved combat wreck field');
    restored.set(id, cloneCareerJson([...wrecks]));
  }
  return restored;
}

function createFieldInstance(
  location: WorldLocation,
  claims: AsteroidClaimRegistry,
  initial?: LocalSpaceInstance
) {
  const seed = claims.seedFor(location.id, () =>
    initial?.sourceLocationId === location.id
      ? initial.seed
      : hashId('sojourn-field:' + location.id)
  );
  const instance =
    initial?.sourceLocationId === location.id
      ? initial
      : generateMiningSpace(location.id, seed, location.minedResourceIds);
  return instance;
}
function restoreMiningChunks(
  instance: LocalSpaceInstance,
  chunks: readonly MiningChunk[] | undefined
): void {
  if (chunks === undefined) return;
  if (!Array.isArray(chunks) || chunks.length > 10000) {
    throw new Error('Invalid saved mining chunks');
  }
  const ids = new Set<string>();
  for (const chunk of chunks) {
    const asteroid = instance.asteroids.find((entry) => entry.id === chunk.sourceAsteroidId);
    if (
      typeof chunk.id !== 'string' ||
      !chunk.id.startsWith('chunk-' + instance.seed + '-') ||
      ids.has(chunk.id) ||
      !asteroid?.deposits.some((entry) => entry.resourceId === chunk.resourceId) ||
      !Number.isSafeInteger(chunk.amount) ||
      chunk.amount <= 0 ||
      !Number.isFinite(chunk.ageSeconds) ||
      chunk.ageSeconds < 0 ||
      !Number.isFinite(chunk.position?.x) ||
      !Number.isFinite(chunk.position?.y) ||
      !Number.isFinite(chunk.velocity?.x) ||
      !Number.isFinite(chunk.velocity?.y) ||
      typeof chunk.tractorActive !== 'boolean' ||
      (chunk.tractorHardpointId !== null && typeof chunk.tractorHardpointId !== 'string')
    ) {
      throw new Error('Invalid saved mining chunk');
    }
    ids.add(chunk.id);
  }
  instance.chunks.splice(0, instance.chunks.length, ...cloneCareerJson([...chunks]));
}

export class AsteroidFieldWorld {
  private readonly fields = new Map<string, AsteroidFieldRuntime>();
  private backgroundAccumulator = 0;
  private readonly combatWrecksByLocation = new Map<string, SalvageWreck[]>();
  private readonly wreckMotionFields = new Map<string, SalvageField>();

  constructor(
    locations: readonly WorldLocation[],
    claims: AsteroidClaimRegistry,
    miners: CareerMinerFactory,
    checkpoint?: CareerAsteroidFieldCheckpoint,
    npcs: readonly SectorNpcState[] = [],
    initial?: LocalSpaceInstance
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
      for (const [id, wrecks] of restoredCombatWrecks(
        locations,
        checkpoint.combatWrecksByLocation
      )) {
        this.combatWrecksByLocation.set(id, wrecks);
      }
    }
    for (const location of locations) {
      if (!location.activities.mine) continue;
      const instance = createFieldInstance(location, claims, initial);
      const seed = instance.seed;
      claims.restoreField(location.id, instance.asteroids);
      const saved = checkpoint?.fields[location.id];
      restoreMiningChunks(instance, saved?.chunks);
      if (!this.combatWrecksByLocation.has(location.id))
        this.combatWrecksByLocation.set(location.id, []);
      this.fields.set(location.id, {
        combatWrecks: this.combatWrecksByLocation.get(location.id)!,
        locationId: location.id,
        instance,
        miners: miners(location, instance, saved?.miners),
        pirates: saved
          ? LocalPirateTraffic.fromCheckpoint(
              instance.width,
              instance.height,
              seed,
              npcs,
              saved.pirates
            )
          : new LocalPirateTraffic(instance.width, instance.height, seed),
        drone: saved
          ? AsteroidSecurityDrone.fromCheckpoint(
              instance.width,
              instance.height,
              instance.asteroids,
              saved.drone
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
        ...(field.instance.chunks.length ? { chunks: field.instance.chunks } : {}),
      };
    }
    return cloneCareerJson({
      version: 1 as const,
      backgroundAccumulator: this.backgroundAccumulator,
      combatWrecksByLocation: Object.fromEntries(this.combatWrecksByLocation),
      fields,
    });
  }

  combatWrecks(locationId: string): SalvageWreck[] {
    return this.combatWrecksByLocation.get(locationId) ?? [];
  }

  registerCombatWrecks(locationId: string, wrecks: readonly SalvageWreck[]): void {
    const existing = this.combatWrecksByLocation.get(locationId) ?? [];
    const ids = new Set(existing.map((wreck) => wreck.id));
    for (const wreck of wrecks) {
      if (!wreck.combatWreckVariant || ids.has(wreck.id)) continue;
      existing.push(wreck);
      ids.add(wreck.id);
    }
    if (existing.length) this.combatWrecksByLocation.set(locationId, existing);
  }

  reconcileCombatWrecks(locationId: string, wrecks: readonly SalvageWreck[]): void {
    const recorded = this.combatWrecksByLocation.get(locationId) ?? [];
    recorded.splice(
      0,
      recorded.length,
      ...wrecks.filter((wreck) => wreck.combatWreckVariant !== undefined)
    );
    this.combatWrecksByLocation.set(locationId, recorded);
    const field = this.wreckMotionFields.get(locationId);
    if (field) invalidateSalvagePhysics(field);
  }

  advanceCombatWreckLifetime(
    deltaSeconds: number,
    onRemove: (locationId: string, ids: ReadonlySet<string>) => void
  ): void {
    const dt = Math.min(0.25, Math.max(0, deltaSeconds));
    if (!Number.isFinite(dt)) return;
    for (const [locationId, wrecks] of this.combatWrecksByLocation) {
      if (!wrecks.length) continue;
      const removed = new Set<string>();
      for (let i = wrecks.length - 1; i >= 0; i--) {
        const wreck = wrecks[i]!;
        wreck.remainingLifetimeSeconds = Math.max(
          0,
          (wreck.remainingLifetimeSeconds ?? COMBAT_WRECK_LIFETIME_SECONDS) - dt
        );
        if (
          wreck.remainingLifetimeSeconds > 0 &&
          wreck.resources.some((deposit) => deposit.remainingAmount > 0)
        )
          continue;
        removed.add(wreck.id);
        wrecks.splice(i, 1);
      }
      if (!removed.size) continue;
      const motion = this.wreckMotionFields.get(locationId);
      if (motion) invalidateSalvagePhysics(motion);
      onRemove(locationId, removed);
    }
  }

  /** Player navigation and shield contacts share the authoritative salvage wreck bodies. */
  combatWreckPhysicsBodies(locationId: string): readonly LocalAsteroid[] {
    const field = this.combatWreckMotionField(locationId);
    return field ? salvageFieldPhysicsBodies(field) : [];
  }

  /** Publish a mining-ship impact back to the recoverable wreck's saved pose. */
  syncCombatWreckContacts(locationId: string): void {
    const field = this.wreckMotionFields.get(locationId);
    if (field) syncSalvagePhysicsContacts(field);
  }

  private combatWreckMotionField(locationId: string): SalvageField | null {
    const wrecks = this.combatWrecksByLocation.get(locationId);
    if (!wrecks?.length) return null;
    let field = this.wreckMotionFields.get(locationId);
    if (!field || field.wrecks !== wrecks) {
      const mining = this.fields.get(locationId)?.instance;
      field = {
        id: 'combat-wreck-motion-' + locationId,
        sourceLocationId: locationId,
        seed: mining?.seed ?? 0,
        width: mining?.width ?? 2400,
        height: mining?.height ?? 1800,
        wrecks,
      };
      this.wreckMotionFields.set(locationId, field);
    }
    return field;
  }

  /** The same 3D spin, impulse and drift physics used in salvage maps.
   * Active salvage and embedded combat own their wreck poses themselves. */
  advanceCombatWreckMotion(
    deltaSeconds: number,
    skipLocationId?: string | null,
    combatLocations: ReadonlySet<string> = new Set()
  ): void {
    const dt = Math.min(0.05, Math.max(0, deltaSeconds));
    if (dt <= 0) return;
    if (skipLocationId) {
      const suspended = this.wreckMotionFields.get(skipLocationId);
      if (suspended) invalidateSalvagePhysics(suspended);
    }
    for (const [locationId, wrecks] of this.combatWrecksByLocation) {
      if (combatLocations.has(locationId)) {
        const suspended = this.wreckMotionFields.get(locationId);
        if (suspended) invalidateSalvagePhysics(suspended);
        continue;
      }
      if (locationId === skipLocationId || wrecks.length === 0) continue;
      const field = this.combatWreckMotionField(locationId);
      if (field) advanceSalvageContainerDrift(field, dt);
    }
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
