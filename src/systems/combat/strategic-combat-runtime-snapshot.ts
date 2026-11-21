import type { StrategicCombatRuntime, StrategicCombatSnapshot } from './strategic-combat-types';
import { snapshot, distance } from './strategic-combat-geometry';
import { runtimeEnemy } from './strategic-combat-runtime';
import { mineDetection } from './strategic-combat-movement';

export function runtimeSnapshot(runtime: StrategicCombatRuntime): StrategicCombatSnapshot {
  const escapeGate =
    runtime.attacker.escapeGate ?? runtime.defender.escapeGate ?? runtime.arena.exitPoint!;
  return {
    attacker: {
      ...snapshot(runtime.attacker),
      tractorLocked:
        runtime.attacker.shieldHp <= 0 &&
        runtime.defender.hullHp > 0 &&
        runtime.defender.subsystems.tractor > 0 &&
        runtime.defender.powerFault !== 'total' &&
        distance(runtime.attacker.position, runtime.defender.position) <=
          (runtime.defender.setup.tractorRangeMeters ?? 0),
    },
    defender: {
      ...snapshot(runtime.defender),
      tractorLocked:
        runtime.defender.shieldHp <= 0 &&
        runtime.attacker.hullHp > 0 &&
        runtime.attacker.subsystems.tractor > 0 &&
        runtime.attacker.powerFault !== 'total' &&
        distance(runtime.defender.position, runtime.attacker.position) <=
          (runtime.attacker.setup.tractorRangeMeters ?? 0),
    },
    elapsedSeconds: runtime.elapsedSeconds,
    exitPoint: escapeGate,
    winner: runtime.winner,
    outcomeReason: runtime.outcomeReason ?? null,
    boardingInitiator: runtime.boardingInitiator,
    grapple: runtime.grapple
      ? {
          ...runtime.grapple,
          origin: { ...runtime.grapple.origin },
          target: { ...runtime.grapple.target },
        }
      : null,
    grappleUsed: { ...runtime.grappleUsed },
    lastEvent: runtime.lastEvent,
    combatLog: runtime.combatLog.slice(-80).map((entry) => ({ ...entry })),
    projectiles: runtime.projectiles.map((projectile) => ({
      id: projectile.id,
      owner: projectile.owner,
      kind: projectile.kind,
      family: projectile.family,
      origin: { ...projectile.origin },
      position: { ...projectile.position },
      target: { ...runtimeEnemy(runtime, projectile.owner).position },
      ttlSeconds: projectile.ttlSeconds,
      direction: { ...projectile.direction },
      missed: projectile.missed === true,
    })),
    beams: runtime.beams.map((beam) => ({
      ...beam,
      origin: { ...beam.origin },
      end: { ...beam.end },
    })),
    thrownAsteroids: runtime.thrownAsteroids.map((rock) => ({
      ...rock,
      position: { ...rock.position },
      velocity: { ...rock.velocity },
    })),
    mines: runtime.mines.map((mine) => ({
      id: mine.id,
      owner: mine.owner,
      mineId: mine.definition.id,
      kind: mine.definition.kind,
      name: mine.definition.name,
      tier: mine.definition.tier,
      position: { ...mine.position },
      armed: mine.armedSeconds <= 0,
      radius: mine.definition.triggerRadiusMeters,
      detection:
        mine.owner === 'attacker'
          ? 'identified'
          : mineDetection(mine.definition, runtime.attacker, mine.position),
    })),
    lastImpact: runtime.lastImpact,
    recentImpacts: runtime.recentImpacts.map((impact) => ({
      ...impact,
      position: { ...impact.position },
    })),
    arena: {
      width: runtime.arena.width,
      height: runtime.arena.height,
      obstacles: runtime.arena.obstacles ?? [],
      asteroids: runtime.arena.asteroids ?? [],
      ...(runtime.arena.backdropSeed !== undefined
        ? { backdropSeed: runtime.arena.backdropSeed }
        : {}),
    },
  };
}
