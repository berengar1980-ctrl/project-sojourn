import { createDuelLobby } from './duel-lobby';
import { createFleetTestLobby, type LaunchFleetField } from './fleet-test-lobby';

/** Only the test UI is shared. The existing 1vs1 runtime stays untouched. */
export function createCombatTestTabs(
  root: HTMLElement,
  onBack: () => void,
  launch: LaunchFleetField
): { destroy(): void } {
  const container = document.createElement('div');
  container.className = 'harrow-combat-tests';
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
  const setCombatActive = (active: boolean): void => {
    container.classList.toggle('is-combat-active', active);
    tabs.hidden = active;
  };
  const show = (mode: 'duel' | 'fleet'): void => {
    setCombatActive(false);
    current?.destroy();
    duelTab.setAttribute('aria-current', mode === 'duel' ? 'page' : 'false');
    fleetTab.setAttribute('aria-current', mode === 'fleet' ? 'page' : 'false');
    current =
      mode === 'duel'
        ? createDuelLobby(content, onBack, setCombatActive)
        : createFleetTestLobby(content, onBack, setCombatActive, launch);
  };
  duelTab.addEventListener('click', () => show('duel'));
  fleetTab.addEventListener('click', () => show('fleet'));
  show('duel');
  return {
    destroy() {
      current?.destroy();
      setCombatActive(false);
      container.remove();
    },
  };
}
