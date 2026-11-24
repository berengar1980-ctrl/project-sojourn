import type {
  StrategicCombatService,
  StrategicCombatStatus,
} from './strategic-combat-service-types';

const NPC_BOARDING_SECONDS = 10;

export class NativeFleetBoarding {
  private readonly results: ReturnType<StrategicCombatService['getSnapshot']>[] = [];
  private readonly startedAt = new Map<StrategicCombatService, number>();

  drainResults() {
    return this.results.splice(0);
  }

  get active(): boolean {
    return this.startedAt.size > 0;
  }

  includes(shipId: string): boolean {
    for (const service of this.startedAt.keys()) {
      const { attackerId, defenderId } = service.getStatus();
      if (shipId === attackerId || shipId === defenderId) return true;
    }
    return false;
  }

  start(service: StrategicCombatService, status: StrategicCombatStatus, seconds: number): boolean {
    if (!status.boardingInitiator) return false;
    const attacker = service.getParallelActor?.('attacker');
    const defender = service.getParallelActor?.('defender');
    if (!attacker?.setup.aiControlled || !defender?.setup.aiControlled) return false;
    if (!this.startedAt.has(service)) this.startedAt.set(service, seconds);
    return true;
  }

  resolve(seconds: number, checkTimeout: boolean): void {
    for (const [service, started] of this.startedAt) {
      const attacker = service.getParallelActor?.('attacker');
      const defender = service.getParallelActor?.('defender');
      if (!attacker || !defender) continue;
      const destroyed = attacker.hullHp <= 0 || defender.hullHp <= 0;
      if (!destroyed && (!checkTimeout || seconds - started + 1e-9 < NPC_BOARDING_SECONDS))
        continue;
      service.resolveNpcBoarding(destroyed);
      this.results.push(service.getSnapshot());
      this.startedAt.delete(service);
    }
  }
}
