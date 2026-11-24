import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import { combatantHud } from './fleet-native-combat-panel';

/**
 * Embedded local fights use the same authoritative duel snapshot and the
 * same shield, subsystem and weapon telemetry markup as standalone combat.
 * Only the HUD is shared: the local scene retains its own moving field.
 */
export function createEmbeddedCombatHud(shell: HTMLElement): {
  update(snapshot: StrategicCombatSnapshot | null): void;
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
    update(snapshot): void {
      const active = snapshot !== null;
      if (active !== wasActive) {
        wasActive = active;
        shell.classList.toggle('is-embedded-combat', active);
        player.setAttribute('aria-hidden', String(!active));
        enemy.setAttribute('aria-hidden', String(!active));
      }
      if (!snapshot) return;
      player.innerHTML = combatantHud(snapshot.attacker, snapshot.elapsedSeconds);
      enemy.innerHTML = combatantHud(snapshot.defender, snapshot.elapsedSeconds);
    },
  };
}
