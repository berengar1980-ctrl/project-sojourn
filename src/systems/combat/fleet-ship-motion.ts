import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';
import type {
  FleetShip,
  FleetCombatShipSnapshot,
  FleetCombatWorldOptions,
} from './fleet-combat-service';
import { distance, snapshot } from './strategic-combat-geometry';
import {
  moveCombatant,
  resolveCombatantCollision,
  resolveArenaObstacles,
} from './strategic-combat-movement';
import { advanceShieldImpacts } from '../shields/shield-service';
import { isFleetHostile } from './fleet-faction-policy';

function advanceExternalFleetMotion(
  ship: FleetShip,
  fleet: readonly FleetShip[],
  nearby: readonly FleetCombatShipSnapshot[],
  arena: StrategicCombatArenaOptions,
  dt: number
): void {
  const actor = ship.combatant;
  const next = ship.externalMovement?.(dt, nearby);
  if (!next) return;
  if (next.active === false) {
    ship.active = false;
    ship.departed = true;
    ship.targetId = null;
    return;
  }
  if (next.combatMotionTargetId) {
    const enemy = fleet.find(
      (candidate) => candidate.combatant.setup.id === next.combatMotionTargetId
    );
    if (enemy?.active && enemy.combatant.hullHp > 0) {
      actor.tactic = next.combatTactic ?? actor.tactic;
      moveCombatant(actor, enemy.combatant, 'attacker', dt, arena, []);
      ship.combatMotionOwned = true;
      ship.targetId = next.targetId;
      next.afterCombatMotion?.(actor.position, actor.headingRadians, actor.speed);
      return;
    }
  }
  const previous = { ...actor.position };
  actor.position = { ...next.position };
  actor.velocity = {
    x: (next.position.x - previous.x) / dt,
    y: (next.position.y - previous.y) / dt,
  };
  actor.speed = distance(previous, next.position) / dt;
  actor.headingRadians = next.headingRadians;
  ship.targetId = next.targetId;
}

export function advanceFleetMotion(
  fleet: readonly FleetShip[],
  acquire: (ship: FleetShip) => FleetShip | null,
  arena: StrategicCombatArenaOptions,
  dt: number,
  worldTick?: FleetCombatWorldOptions['tickWorld'],
  beforeWorldTick?: FleetCombatWorldOptions['beforeWorldTick'],
  onRamContact?: (first: MutableCombatant, second: MutableCombatant) => void
): void {
  // Threat decisions precede the field tick: a threatened miner cannot mine.
  beforeWorldTick?.(
    fleet.map((entry) => ({
      factionId: entry.factionId,
      targetId: entry.targetId,
      ship: snapshot(entry.combatant),
    }))
  );
  worldTick?.(dt);
  const nearby = fleet.map((ship) => ({
    factionId: ship.factionId,
    targetId: ship.targetId,
    ship: snapshot(ship.combatant),
  }));
  for (const ship of fleet) {
    ship.combatMotionOwned = false;
    const actor = ship.combatant;
    actor.shieldImpacts = advanceShieldImpacts(actor.shieldImpacts, dt);
    if (actor.hullHp <= 0) continue;
    if (ship.externalMovement) {
      advanceExternalFleetMotion(ship, fleet, nearby, arena, dt);
      continue;
    }
    const target = acquire(ship);
    if (target) {
      moveCombatant(actor, target.combatant, 'attacker', dt, arena, []);
    } else {
      actor.position.x = Math.max(
        0,
        Math.min(arena.width, actor.position.x + actor.velocity.x * dt)
      );
      actor.position.y = Math.max(
        0,
        Math.min(arena.height, actor.position.y + actor.velocity.y * dt)
      );
      resolveArenaObstacles(actor, arena);
    }
  }
  for (let i = 0; i < fleet.length; i += 1) {
    for (let j = i + 1; j < fleet.length; j += 1) {
      if (!fleet[i]!.active || !fleet[j]!.active) continue;
      // The campaign drone already resolves its own physical ship contacts.
      if (
        (fleet[i]!.externalMovement && !fleet[i]!.combatMotionOwned) ||
        (fleet[j]!.externalMovement && !fleet[j]!.combatMotionOwned)
      )
        continue;
      const a = fleet[i]!.combatant;
      const b = fleet[j]!.combatant;
      if (a.hullHp > 0 && b.hullHp > 0) {
        if (isFleetHostile(fleet[i]!.factionId, fleet[j]!.factionId)) onRamContact?.(a, b);
        resolveCombatantCollision(a, b);
      }
    }
  }
}
