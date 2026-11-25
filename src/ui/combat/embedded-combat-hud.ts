import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import {
  createFleetDisplayMenu,
  DEFAULT_COMBAT_DISPLAY,
  type FleetDisplayPreferences,
} from './fleet-display-menu';
import { combatantHud } from './fleet-native-combat-panel';

/**
 * Embedded local fights use the same authoritative duel snapshot and the
 * same shield, subsystem and weapon telemetry markup as standalone combat.
 * Only the HUD is shared: the local scene retains its own moving field.
 */
export function createEmbeddedCombatHud(shell: HTMLElement): {
  update(snapshot: StrategicCombatSnapshot | null, display?: FleetDisplayPreferences): void;
} {
  const player = document.createElement('aside');
  player.className = 'combat-hud combat-hud--player embedded-combat-hud';
  player.setAttribute('aria-label', 'Eigenes Schiff und Waffen');
  const enemy = document.createElement('aside');
  enemy.className = 'combat-hud combat-hud--enemy embedded-combat-hud';
  enemy.setAttribute('aria-label', 'Gegner und Waffen');
  shell.append(player, enemy);

  let wasActive = false;
  return {
    update(snapshot, display = DEFAULT_COMBAT_DISPLAY): void {
      const active = snapshot !== null;
      if (active !== wasActive) {
        wasActive = active;
        shell.classList.toggle('is-embedded-combat', active);
      }
      player.hidden = !active || !display.playerHud;
      enemy.hidden = !active || !display.enemyHud;
      player.setAttribute('aria-hidden', String(player.hidden));
      enemy.setAttribute('aria-hidden', String(enemy.hidden));
      if (!snapshot) return;
      if (!player.hidden)
        player.innerHTML = combatantHud(
          snapshot.attacker,
          snapshot.elapsedSeconds,
          display.playerWeapons
        );
      if (!enemy.hidden)
        enemy.innerHTML = combatantHud(
          snapshot.defender,
          snapshot.elapsedSeconds,
          display.enemyWeapons
        );
    },
  };
}

/** Use the same menu and stored settings as the standalone combat screen. */
export function createEmbeddedCombatDisplay(shell: HTMLElement) {
  const menu = createFleetDisplayMenu(shell, ['overview', 'events'], 54);
  const hud = createEmbeddedCombatHud(shell);
  let snapshot: StrategicCombatSnapshot | null = null;
  return {
    get: menu.get,
    onChange(redraw: () => void): void {
      menu.onChange(() => {
        hud.update(snapshot, menu.get());
        redraw();
      });
    },
    update(next: StrategicCombatSnapshot | null): void {
      snapshot = next;
      hud.update(next, menu.get());
    },
  };
}
