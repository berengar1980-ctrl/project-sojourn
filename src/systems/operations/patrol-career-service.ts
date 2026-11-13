import type { PlayerEconomyState } from '../../core/economy-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap } from '../../core/world-types';

export interface PatrolAssignment {
  id: string;
  kind: 'route' | 'bounty';
  targetId: string;
  reward: number;
  acceptedDay: number;
  deadline: number;
  status: 'active' | 'completed' | 'failed' | 'paid';
  visited: string[];
  clearSeconds: number;
}
export class PatrolCareerService {
  private mandate = false;
  private reputation = 0;
  private completed = 0;
  private day = 0;
  private sequence = 0;
  private assignments: PatrolAssignment[] = [];
  constructor(
    private readonly world: WorldMap,
    private readonly npcs: readonly SectorNpcState[],
    private readonly player: PlayerEconomyState
  ) {}
  snapshot() {
    return {
      sequence: this.sequence,
      mandate: this.mandate,
      reputation: this.reputation,
      completed: this.completed,
      day: this.day,
      rank:
        this.completed >= 10
          ? 'Sektorwächter'
          : this.completed >= 3
            ? 'Eskortführer'
            : 'Hilfspatrouille',
      assignments: this.assignments.map((a) => ({ ...a, visited: [...a.visited] })),
    };
  }
  enlist(locationId: string): boolean {
    if (
      this.mandate ||
      this.reputation <= -20 ||
      !this.world.locations.some(
        (l) => l.id === locationId && l.activities.dock && l.stationType !== 'pirate'
      )
    )
      return false;
    this.mandate = true;
    return true;
  }
  resign(): void {
    this.mandate = false;
    for (const a of this.assignments.filter((job) => job.status === 'active')) a.status = 'failed';
  }
  offers() {
    const ports = this.world.locations.filter(
      (l) => l.activities.trade && l.stationType !== 'pirate'
    );
    return [
      ...ports.map((l) => ({ kind: 'route' as const, targetId: l.id, name: l.name, reward: 800 })),
      ...this.npcs
        .filter(
          (n) =>
            n.pirate &&
            n.hullHp > 0 &&
            !(n.combatRecoverySeconds ?? 0) &&
            n.retiredUntilDay === undefined
        )
        .map((n) => ({
          kind: 'bounty' as const,
          targetId: n.id,
          name: n.name,
          reward: 1800 + Math.round(n.hullMaxHp * 4),
        })),
    ];
  }
  accept(kind: 'route' | 'bounty', targetId: string, originId: string): boolean {
    const port = this.world.locations.find((l) => l.id === originId && l.activities.dock);
    const offer = this.offers().find((o) => o.kind === kind && o.targetId === targetId);
    if (!this.mandate || !port || port.stationType === 'pirate' || !offer || targetId === originId)
      return false;
    if (this.assignments.some((a) => a.status === 'active' || a.status === 'completed'))
      return false;
    this.assignments.push({
      id: 'patrol-' + ++this.sequence,
      kind,
      targetId,
      reward: offer.reward,
      acceptedDay: this.day,
      deadline: this.day + 14,
      status: 'active',
      visited: [originId],
      clearSeconds: 0,
    });
    return true;
  }
  observeArrival(locationId: string | null, seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    for (const a of this.assignments.filter(
      (job) => job.status === 'active' && job.kind === 'route'
    )) {
      if (locationId !== a.targetId) {
        a.clearSeconds = 0;
        continue;
      }
      const hostile = this.npcs.some(
        (n) =>
          n.pirate &&
          n.locationId === locationId &&
          !n.travel &&
          n.hullHp > 0 &&
          !(n.combatRecoverySeconds ?? 0)
      );
      if (hostile) {
        a.clearSeconds = 0;
        continue;
      }
      a.clearSeconds += Math.min(seconds, 0.25);
      if (a.clearSeconds >= 12) {
        a.visited.push(locationId);
        a.status = 'completed';
      }
    }
  }
  recordAttack(npc: SectorNpcState): void {
    if (npc.pirate || !this.mandate) return;
    this.reputation = Math.max(-100, this.reputation - 30);
    this.resign();
  }
  recordVictory(npcId: string): void {
    if (!this.mandate || !this.npcs.some((n) => n.id === npcId && n.pirate)) return;
    for (const a of this.assignments.filter(
      (job) => job.status === 'active' && job.kind === 'bounty' && job.targetId === npcId
    ))
      a.status = 'completed';
  }
  claimReward(locationId: string): number {
    if (
      !this.mandate ||
      !this.world.locations.some(
        (l) => l.id === locationId && l.activities.dock && l.stationType !== 'pirate'
      )
    )
      return 0;
    const a = this.assignments.find((job) => job.status === 'completed');
    if (!a) return 0;
    a.status = 'paid';
    this.player.credits += a.reward;
    this.completed++;
    this.reputation = Math.min(100, this.reputation + 5);
    return a.reward;
  }
  advanceDay(day: number): void {
    if (!Number.isSafeInteger(day) || day <= this.day) return;
    this.day = day;
    for (const a of this.assignments.filter(
      (job) => job.status === 'active' && day > job.deadline
    )) {
      a.status = 'failed';
      this.reputation = Math.max(-100, this.reputation - 2);
    }
  }
}
