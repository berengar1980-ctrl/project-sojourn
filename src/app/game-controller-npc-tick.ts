import type { ControllerEconomy } from './game-controller-economy';
import { measurePerformance } from '../core/performance-diagnostics';

export function tickControllerNpcOperations(
  economy: ControllerEconomy,
  deltaSeconds: number
): void {
  measurePerformance('sim.npcs.sector', () => economy.sectorNpcs.tick(deltaSeconds));
  measurePerformance('sim.npcs.blockades', () => economy.blockades.tick());
  measurePerformance('sim.npcs.smuggling', () => economy.npcSmuggling.tick(deltaSeconds));
  measurePerformance('sim.npcs.salvage-events', () => economy.npcSalvageEvents.tick());
  measurePerformance('sim.npcs.economy', () => economy.npcs.tick(deltaSeconds));
}
