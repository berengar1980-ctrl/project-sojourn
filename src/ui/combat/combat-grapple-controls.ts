import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';

export function updateCombatGrappleButton(
  container: Element,
  combat: StrategicCombatSnapshot | null
): void {
  const button = container.querySelector<HTMLButtonElement>('[data-grapple]');
  if (!button) return;
  const range = combat
    ? Math.hypot(
        combat.attacker.position.x - combat.defender.position.x,
        combat.attacker.position.y - combat.defender.position.y
      )
    : Infinity;
  button.disabled =
    !combat ||
    combat.winner !== null ||
    combat.grapple !== null ||
    combat.grappleUsed.attacker ||
    combat.defender.shieldHp > 0 ||
    combat.defender.hullHp <= 0 ||
    range > 900;
  button.textContent = combat?.grappleUsed.attacker ? 'GREIFHAKEN VERBRAUCHT' : 'GREIFHAKEN';
}
