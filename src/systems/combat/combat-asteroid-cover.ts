import type { CombatPoint, MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';
import { normalize } from './strategic-combat-geometry';

/** Use an actual rock between both ships, not an arbitrary orbit point. */
export function asteroidCoverHeading(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): CombatPoint | null {
  if (!ship.setup.aiControlled || ship.tactic === 'flee' || ship.shieldHp > ship.shieldMaxHp * 0.4)
    return null;
  const dx = ship.position.x - enemy.position.x;
  const dy = ship.position.y - enemy.position.y;
  const separation = Math.hypot(dx, dy);
  if (separation < 180 || separation > 1300) return null;
  const rocks = (arena.obstacles ?? [])
    .filter((rock) => rock.radius >= 35)
    .map((rock) => {
      const ex = rock.position.x - enemy.position.x;
      const ey = rock.position.y - enemy.position.y;
      const projection = (ex * dx + ey * dy) / separation;
      const lateral = Math.abs(ex * dy - ey * dx) / separation;
      const rockToShip = Math.hypot(rock.position.x - ship.position.x, rock.position.y - ship.position.y);
      return { rock, projection, lateral, rockToShip };
    })
    .filter((candidate) =>
      candidate.projection > 90 &&
      candidate.projection < separation + 280 &&
      candidate.rockToShip < 520
    )
    .sort((a, b) => a.lateral - b.lateral + (a.rockToShip - b.rockToShip) * 0.12);
  const closest = rocks[0];
  if (!closest || closest.lateral > closest.rock.radius + 155) return null;
  const away = normalize(closest.rock.position.x - enemy.position.x, closest.rock.position.y - enemy.position.y);
  const targetX = closest.rock.position.x + away.x * (closest.rock.radius + 105);
  const targetY = closest.rock.position.y + away.y * (closest.rock.radius + 105);
  const tx = targetX - ship.position.x;
  const ty = targetY - ship.position.y;
  return Math.hypot(tx, ty) < 35 ? null : normalize(tx, ty);
}
