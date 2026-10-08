import type {
  DistressActionResult,
  DistressDamageType,
  SalvageWreckKind,
  SectorSalvageEvent,
} from '../../core/salvage-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';

export const MAX_ACTIVE_SALVAGE_EVENTS = 3;
export const MAX_ACTIVE_DISTRESS_EVENTS = 1;

const DISTRESS_DAMAGE: readonly DistressDamageType[] = [
  'nav_bus',
  'drive_control',
  'power_grid',
  'main_drive',
  'coolant',
  'hull_breach',
  'total_loss',
];

const WRECK_KINDS: readonly SalvageWreckKind[] = ['freighter', 'salvager', 'miner', 'patrol'];

const CRITICAL_DISTRESS = new Set<DistressDamageType>([
  'main_drive',
  'coolant',
  'hull_breach',
  'total_loss',
]);

function randomFrom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function clampPoint(world: WorldMap, point: WorldPoint): WorldPoint {
  return {
    x: Math.max(180, Math.min(world.width - 180, point.x)),
    y: Math.max(180, Math.min(world.height - 180, point.y)),
  };
}

function eventPosition(world: WorldMap, origin: WorldPoint, random: () => number): WorldPoint {
  const angle = random() * Math.PI * 2;
  const distance = 520 + random() * 980;
  return clampPoint(world, {
    x: origin.x + Math.cos(angle) * distance,
    y: origin.y + Math.sin(angle) * distance,
  });
}

function cloneEvent(event: SectorSalvageEvent): SectorSalvageEvent {
  return { ...event, position: { ...event.position } };
}

function distressDifficulty(damage: DistressDamageType | null): number {
  if (damage === 'power_grid') return 62;
  if (damage === 'drive_control') return 52;
  return 42;
}

export interface SectorSalvageEventService {
  readonly active: readonly SectorSalvageEvent[];
  event(id: string | null): SectorSalvageEvent | null;
  advanceDay(day: number, playerPosition: WorldPoint, playerHasSalvager: boolean): void;
  resolve(id: string): boolean;
  diagnoseDistress(id: string): DistressActionResult | null;
  repairDistress(id: string, engineeringSkill: number): DistressActionResult | null;
  towDistress(id: string): DistressActionResult | null;
  evacuateDistress(id: string): DistressActionResult | null;
  resolveBoarding(id: string, victory: boolean): DistressActionResult | null;
  grantSalvageRights(id: string): boolean;
  claimForNpc(id: string, npcId: string): boolean;
  releaseNpcClaim(id: string, npcId: string): void;
  resolveForNpc(id: string, npc: SectorNpcState): boolean;
}

class SectorSalvageEventRuntime implements SectorSalvageEventService {
  private readonly events: SectorSalvageEvent[] = [];
  private readonly random: () => number;
  private nextSpecialDay: number;
  private nextDistressDay: number;
  private serial = 0;

  constructor(
    private readonly world: WorldMap,
    seed: number
  ) {
    this.random = randomFrom(seed);
    this.nextSpecialDay = 1 + Math.floor(this.random() * 2);
    this.nextDistressDay = 2 + Math.floor(this.random() * 2);
  }

  get active(): readonly SectorSalvageEvent[] {
    return this.live().map(cloneEvent);
  }

  event(id: string | null): SectorSalvageEvent | null {
    if (!id) return null;
    return this.events.find((entry) => entry.id === id && !entry.resolved) ?? null;
  }

  advanceDay(day: number, playerPosition: WorldPoint, playerHasSalvager: boolean): void {
    this.prune(day);
    if (!playerHasSalvager) return;
    if (day >= this.nextSpecialDay) {
      this.spawnSpecial(day, playerPosition);
      this.nextSpecialDay = day + 1 + Math.floor(this.random() * 2);
    }
    if (day >= this.nextDistressDay) {
      this.spawnDistress(day, playerPosition);
      this.nextDistressDay = day + 2 + Math.floor(this.random() * 3);
    }
  }

  resolve(id: string): boolean {
    const event = this.events.find((entry) => entry.id === id);
    if (!event || event.resolved) return false;
    event.resolved = true;
    return true;
  }

  diagnoseDistress(id: string): DistressActionResult | null {
    const event = this.distress(id);
    if (!event || event.distressStage !== 'approach') return null;
    event.distressStage = 'diagnosed';
    return this.result(
      true,
      `Diagnose abgeschlossen: ${event.distressDamage ?? 'unbekannter Schaden'}.`
    );
  }

  repairDistress(id: string, engineeringSkill: number): DistressActionResult | null {
    const event = this.distress(id);
    if (!event || event.distressStage !== 'diagnosed') return null;
    if (event.distressDamage && CRITICAL_DISTRESS.has(event.distressDamage)) {
      return this.result(
        false,
        'Der Schaden ist zu schwer für eine Notreparatur. Evakuierung oder Abschleppen nötig.'
      );
    }
    const difficulty = distressDifficulty(event.distressDamage);
    const success =
      engineeringSkill >= difficulty || this.random() < Math.max(0, engineeringSkill) / 100;
    if (success) {
      event.resolved = true;
      event.distressStage = 'resolved';
    }
    return this.result(
      success,
      success
        ? 'Notreparatur erfolgreich. Der Havarist kann aus eigener Kraft weiterfliegen.'
        : 'Notreparatur fehlgeschlagen. Abschleppen bleibt möglich.'
    );
  }

  towDistress(id: string): DistressActionResult | null {
    const event = this.distress(id);
    if (!event || event.distressStage !== 'diagnosed') return null;
    event.distressStage = 'resolved';
    event.resolved = true;
    return this.result(
      true,
      'Schleppverbindung hergestellt und Havarist an einen sicheren Übergabepunkt gebracht.'
    );
  }

  evacuateDistress(id: string): DistressActionResult | null {
    const event = this.distress(id);
    if (!event || event.distressStage !== 'diagnosed') return null;
    if (event.distressTrap) {
      return this.result(false, 'Der Hilferuf ist ein Hinterhalt. Enterkampf ausgelöst.', true);
    }
    if (this.random() < 0.3 && this.random() < 0.38) {
      event.salvageRights = true;
      event.distressStage = 'salvage_rights';
      event.expiresDay += 2;
      return this.result(
        true,
        'Evakuierung erfolgreich. Als Ersatzleistung wurden Bergungsrechte am aufgegebenen Schiff übertragen.',
        false,
        true
      );
    }
    event.distressStage = 'resolved';
    event.resolved = true;
    return this.result(true, 'Evakuierung erfolgreich. Die Besatzung wurde übernommen.');
  }

  resolveBoarding(id: string, victory: boolean): DistressActionResult | null {
    const event = this.distress(id);
    if (!event) return null;
    event.distressStage = 'resolved';
    event.resolved = true;
    return this.result(
      victory,
      victory
        ? 'Hinterhalt abgewehrt. Die Angreifer wurden besiegt und der Hilferuf abgeschlossen.'
        : 'Das Enterteam musste den Einsatz abbrechen.'
    );
  }

  grantSalvageRights(id: string): boolean {
    const event = this.distress(id);
    if (!event) return false;
    event.salvageRights = true;
    event.distressStage = 'salvage_rights';
    event.expiresDay += 2;
    return true;
  }

  claimForNpc(id: string, npcId: string): boolean {
    const event = this.event(id);
    if (!event || (event.claimedByNpcId && event.claimedByNpcId !== npcId)) return false;
    event.claimedByNpcId = npcId;
    return true;
  }

  releaseNpcClaim(id: string, npcId: string): void {
    const event = this.event(id);
    if (event?.claimedByNpcId === npcId) event.claimedByNpcId = null;
  }

  resolveForNpc(id: string, npc: SectorNpcState): boolean {
    const event = this.event(id);
    if (!event || event.claimedByNpcId !== npc.id) return false;
    event.resolved = true;
    npc.successfulRuns += 1;
    npc.activityId = 'salvage-event-complete';
    npc.activity = `Bergungsereignis abgeschlossen · ${event.title}`;
    return true;
  }

  private live(): SectorSalvageEvent[] {
    return this.events.filter((event) => !event.resolved);
  }

  private distress(id: string): SectorSalvageEvent | null {
    const event = this.event(id);
    return event?.type === 'distress-rescue' ? event : null;
  }

  private prune(day: number): void {
    for (const event of this.events) {
      if (!event.resolved && event.expiresDay <= day && !event.salvageRights) {
        event.resolved = true;
      }
    }
  }

  private spawnSpecial(day: number, origin: WorldPoint): void {
    if (this.live().length >= MAX_ACTIVE_SALVAGE_EVENTS) return;
    this.serial += 1;
    const kind = WRECK_KINDS[Math.floor(this.random() * WRECK_KINDS.length)] ?? 'freighter';
    this.events.push({
      id: `salvage-special-${day}-${this.serial}`,
      type: 'special-wreck',
      title: 'SELTENES BERGUNGSSIGNAL',
      description:
        'Auspexanalyse meldet ein ungewöhnlich gut erhaltenes Wrack. Modifizierte Schiffssysteme möglich.',
      position: eventPosition(this.world, origin, this.random),
      wreckKind: kind,
      fieldSeed: Math.floor(this.random() * 0x7fffffff),
      createdDay: day,
      expiresDay: day + 2 + Math.floor(this.random() * 2),
      resolved: false,
      claimedByNpcId: null,
      specialComponent: true,
      distressDamage: null,
      distressStage: null,
      distressTrap: false,
      salvageRights: false,
    });
  }

  private spawnDistress(day: number, origin: WorldPoint): void {
    if (this.live().length >= MAX_ACTIVE_SALVAGE_EVENTS) return;
    if (this.live().some((event) => event.type === 'distress-rescue')) return;
    this.serial += 1;
    const damage = DISTRESS_DAMAGE[Math.floor(this.random() * DISTRESS_DAMAGE.length)] ?? 'nav_bus';
    const critical = CRITICAL_DISTRESS.has(damage);
    this.events.push({
      id: `salvage-distress-${day}-${this.serial}`,
      type: 'distress-rescue',
      title: 'HILFERUF – HAVARIST',
      description:
        'Ein beschädigtes Schiff sendet einen Hilferuf. Diagnose, Reparatur, Abschleppen oder Evakuierung können nötig werden.',
      position: eventPosition(this.world, origin, this.random),
      wreckKind: WRECK_KINDS[Math.floor(this.random() * WRECK_KINDS.length)] ?? 'freighter',
      fieldSeed: Math.floor(this.random() * 0x7fffffff),
      createdDay: day,
      expiresDay: day + 3 + Math.floor(this.random() * 2),
      resolved: false,
      claimedByNpcId: null,
      specialComponent: false,
      distressDamage: damage,
      distressStage: 'approach',
      distressTrap: critical && this.random() < 0.28,
      salvageRights: false,
    });
  }

  private result(
    success: boolean,
    text: string,
    boardingRequired = false,
    salvageRights = false
  ): DistressActionResult {
    return { success, text, boardingRequired, salvageRights };
  }
}

export function createSectorSalvageEventService(
  world: WorldMap,
  seed = 0x50a7a9e
): SectorSalvageEventService {
  return new SectorSalvageEventRuntime(world, seed);
}
