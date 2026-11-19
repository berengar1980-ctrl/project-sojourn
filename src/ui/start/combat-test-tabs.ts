import { createDuelLobby } from './duel-lobby';
import { createFleetTestLobby } from './fleet-test-lobby';

/** Only the test UI is shared. The existing 1vs1 runtime stays untouched. */
export function createCombatTestTabs(root: HTMLElement, onBack: () => void): { destroy(): void } {
  const container = document.createElement('div');
  const tabs = document.createElement('nav');
  tabs.className = 'harrow-combat-tabs';
  tabs.setAttribute('aria-label', 'Kampf-Testmodus');
  const duelTab = document.createElement('button');
  duelTab.textContent = '1vs1 · PvP';
  const fleetTab = document.createElement('button');
  fleetTab.textContent = 'FleetCombat · Test';
  const content = document.createElement('div');
  content.className = 'harrow-combat-tabs__content';
  tabs.append(duelTab, fleetTab);
  container.append(tabs, content);
  root.replaceChildren(container);
  let current: { destroy(): void } | null = null;
  const show = (mode: 'duel' | 'fleet'): void => {
    current?.destroy();
    duelTab.setAttribute('aria-current', mode === 'duel' ? 'page' : 'false');
    fleetTab.setAttribute('aria-current', mode === 'fleet' ? 'page' : 'false');
    current = mode === 'duel'
      ? createDuelLobby(content, onBack)
      : createFleetTestLobby(content);
  };
  duelTab.addEventListener('click', () => show('duel'));
  fleetTab.addEventListener('click', () => show('fleet'));
  show('duel');
  return {
    destroy() {
      current?.destroy();
      container.remove();
    },
  };
}
