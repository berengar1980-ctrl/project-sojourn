import type { LocalSpaceInstance } from '../core/local-space-types';
import type { EconomySimulationService } from '../systems/economy/economy-simulation-service';

export function balanceAsteroidStocks(
  simulation: EconomySimulationService,
  instance: LocalSpaceInstance,
  canRefill: (asteroidId: string) => boolean
): void {
  const pending = new Map<string, number>();
  for (const chunk of instance.chunks) {
    const key = JSON.stringify([chunk.sourceAsteroidId, chunk.resourceId]);
    pending.set(key, (pending.get(key) ?? 0) + chunk.amount);
  }
  for (const asteroid of instance.asteroids) {
    const sourceId = JSON.stringify([instance.sourceLocationId, asteroid.id]);
    for (const deposit of asteroid.deposits) {
      const key = JSON.stringify([asteroid.id, deposit.resourceId]);
      const fragments = pending.get(key) ?? 0;
      const actual = Math.floor(deposit.oreRemaining + fragments);
      const stock = simulation.getPhysicalStock(deposit.resourceId, sourceId);
      if (stock === undefined) continue;
      if (stock > actual) {
        simulation.losePhysicalStock(deposit.resourceId, sourceId, stock - actual);
      }
      if (stock < actual) {
        deposit.oreRemaining = Math.max(0, Math.min(deposit.oreRemaining, stock - fragments));
      }
      if (!canRefill(asteroid.id) || fragments > 0) continue;
      const deficit = Math.floor(deposit.oreCapacity - deposit.oreRemaining);
      if (deficit <= 0) continue;
      const funded = simulation.fundPhysicalStock(deposit.resourceId, sourceId, deficit);
      deposit.oreRemaining += funded;
    }
  }
}
