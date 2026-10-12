import type { StrategicCombatRuntime } from './strategic-combat-types';

export function separateActionShips(runtime: StrategicCombatRuntime): void {
  const attacker = runtime.attacker;
  const defender = runtime.defender;
  const dx = defender.position.x - attacker.position.x;
  const dy = defender.position.y - attacker.position.y;
  const range = Math.hypot(dx, dy);
  if (range >= 105) return;
  const nx = range > 0.001 ? dx / range : 1;
  const ny = range > 0.001 ? dy / range : 0;
  const relative =
    (defender.velocity.x - attacker.velocity.x) * nx +
    (defender.velocity.y - attacker.velocity.y) * ny;
  if (relative >= 35) return;
  const correction = (35 - relative) / 2;
  attacker.velocity.x -= nx * correction;
  attacker.velocity.y -= ny * correction;
  defender.velocity.x += nx * correction;
  defender.velocity.y += ny * correction;
  attacker.speed = Math.hypot(attacker.velocity.x, attacker.velocity.y);
  defender.speed = Math.hypot(defender.velocity.x, defender.velocity.y);
}
