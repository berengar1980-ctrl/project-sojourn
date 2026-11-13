import type { ControllerEconomy } from './game-controller-economy';

export function tickControllerNpcOperations(
  economy: ControllerEconomy,
  deltaSeconds: number
): void {
  economy.sectorNpcs.tick(deltaSeconds);
  economy.blockades.tick();
  economy.npcSmuggling.tick(deltaSeconds);
  economy.npcSalvageEvents.tick();
  economy.npcs.tick(deltaSeconds);
}
