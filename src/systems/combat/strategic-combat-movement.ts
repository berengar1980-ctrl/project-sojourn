import { resolveCombatAsteroidContacts } from './combat-asteroid-contacts';
import { usefulRamAttempt } from './combat-ram-opportunity';
import { chooseCombatFlightIntent } from './combat-flight-intent';
import { steerCombatRoute } from './combat-route-steering';
export { mineDetection, avoidDetectedMine } from './combat-route-steering';
import { updateStandardCombatBoost } from './combat-standard-boost';
import { applyInertialThrust } from './combat-inertial-thrust';
import { preferredRange } from './combat-tactic-choice';
export { updateAiTactic } from './combat-tactic-choice';

import type {
  MutableCombatant,
  StrategicCombatArenaOptions,
  CombatPoint,
  StrategicCombatSide,
  MutableMine,
} from './strategic-combat-types';

import {
  clamp,
  distance,
  EDGE_PADDING,
  normalize,
  wrapAngle,
  DEFAULT_TURN_RATE,
  DEFAULT_ACCELERATION,
} from './strategic-combat-geometry';

export function resolveArenaObstacles(
  combatant: MutableCombatant,
  arena: StrategicCombatArenaOptions
): void {
  resolveCombatAsteroidContacts(combatant, arena);
}

export { resolveCombatantCollision } from './combat-contact-response';

function isTractorLocked(combatant: MutableCombatant, enemy: MutableCombatant): boolean {
  return (
    combatant.shieldHp <= 0 &&
    enemy.hullHp > 0 &&
    enemy.subsystems.tractor > 0 &&
    distance(combatant.position, enemy.position) <= (enemy.setup.tractorRangeMeters ?? 0)
  );
}

/**
 * Heavy side guns dictate the preferred heading, while the main movement
 * routine remains responsible for thrust, inertia and obstacle avoidance.
 */
function broadsideSteering(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  range: number,
  dx: number,
  dy: number
): CombatPoint | null {
  if (combatant.tactic === 'flee') return null;
  if (combatant.strategy && combatant.strategy.focus !== 'broadside') return null;
  const sideGun = combatant.setup.weapons
    .map((weapon, index) => ({ weapon, index }))
    .filter(
      (entry) =>
        entry.weapon.weapon?.mount === 'broadside' &&
        range <= entry.weapon.weapon.rangeMeters * 1.2 &&
        (!combatant.strategy?.broadsideFacing ||
          combatant.setup.weaponMounts?.find((mount) => mount.slotIndex === entry.index)?.facing ===
            combatant.strategy.broadsideFacing)
    )
    .sort((a, b) =>
      enemy.shieldHp > 0
        ? (b.weapon.weapon?.shieldDamage ?? 0) - (a.weapon.weapon?.shieldDamage ?? 0)
        : (b.weapon.weapon?.hullDamage ?? 0) - (a.weapon.weapon?.hullDamage ?? 0)
    )[0];
  if (!sideGun) return null;
  const facing = combatant.setup.weaponMounts?.find(
    (mount) => mount.slotIndex === sideGun.index
  )?.facing;
  const heading =
    Math.atan2(dy, dx) +
    (facing === 'starboard' ? -Math.PI / 2 : facing === 'port' ? Math.PI / 2 : 0);
  return { x: Math.cos(heading), y: Math.sin(heading) };
}

/**
 * Fixed forward guns can track the enemy while the ship still travels along
 * its independently chosen pass. Using RCS for that separation preserves inertia.
 */
function forwardWeaponSteering(
  combatant: MutableCombatant,
  range: number,
  toward: CombatPoint
): CombatPoint | null {
  if (combatant.tactic === 'flee' || combatant.strategy?.focus !== 'forward') return null;
  const forwardRange = Math.max(
    0,
    ...combatant.setup.weapons.flatMap((component, index) => {
      if (component.weapon?.mount !== 'forward') return [];
      const mount = combatant.setup.weaponMounts?.find((entry) => entry.slotIndex === index);
      if (mount?.facing && mount.facing !== 'forward') return [];
      return [component.weapon.rangeMeters];
    })
  );
  // Keep front guns tracking while the ship uses independent RCS for translation.
  if (forwardRange <= 0 || range < 155) return null;
  return toward;
}

function performCombatThrust(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  deltaSeconds: number,
  arena: StrategicCombatArenaOptions,
  headingDirection: CombatPoint,
  targetSpeedFactor: number,
  strafeDirection?: CombatPoint
): void {
  const desiredHeading = Math.atan2(headingDirection.y, headingDirection.x);
  const headingError = wrapAngle(desiredHeading - combatant.headingRadians);
  const maxTurn = Math.max(0.25, combatant.setup.turnRateRadiansPerSecond ?? DEFAULT_TURN_RATE);
  const turn = clamp(headingError, -maxTurn * deltaSeconds, maxTurn * deltaSeconds);
  combatant.headingRadians = wrapAngle(combatant.headingRadians + turn);
  combatant.turnRateRadiansPerSecond = deltaSeconds > 0 ? turn / deltaSeconds : 0;
  combatant.angularThrust = clamp(headingError / Math.max(0.1, maxTurn), -1, 1);

  const baseSpeed = Math.max(65, combatant.setup.combatSpeed ?? 120);
  const acceleration = Math.max(
    12,
    combatant.setup.accelerationMetersPerSecond2 ?? DEFAULT_ACCELERATION
  );
  if (combatant.subsystems.engine <= 0) {
    // With no main engine the ship keeps drifting; only RCS can turn its bow.
    combatant.position.x = clamp(
      combatant.position.x + combatant.velocity.x * deltaSeconds,
      EDGE_PADDING,
      arena.width - EDGE_PADDING
    );
    combatant.position.y = clamp(
      combatant.position.y + combatant.velocity.y * deltaSeconds,
      EDGE_PADDING,
      arena.height - EDGE_PADDING
    );
    resolveArenaObstacles(combatant, arena);
    return;
  }
  applyInertialThrust(
    combatant,
    headingError,
    targetSpeedFactor,
    baseSpeed,
    acceleration,
    isTractorLocked(combatant, enemy),
    deltaSeconds,
    arena,
    strafeDirection
  );
  resolveArenaObstacles(combatant, arena);
}

interface WeaponPostureInput {
  readonly combatant: MutableCombatant;
  readonly enemy: MutableCombatant;
  readonly range: number;
  readonly desired: number;
  readonly toward: CombatPoint;
  readonly travel: CombatPoint;
  readonly canAim: boolean;
  readonly deliberateRam: boolean;
}

/** One owner chooses the bow orientation without replacing the travel vector. */
function chooseWeaponPosture(input: WeaponPostureInput): {
  readonly heading: CombatPoint;
  readonly strafe?: CombatPoint;
} {
  const { combatant, enemy, range, desired, toward, travel } = input;
  if (!input.canAim || input.deliberateRam) return { heading: travel };

  const dx = enemy.position.x - combatant.position.x;
  const dy = enemy.position.y - combatant.position.y;
  const broadside = broadsideSteering(combatant, enemy, range, dx, dy);
  const broadsideReady =
    broadside &&
    combatant.strategy?.phase !== 'reach_range' &&
    range >= Math.max(155, desired * 0.66);
  if (broadsideReady) return { heading: broadside, strafe: travel };

  // A flyby retains weapon aim while RCS handles the travel vector.
  const forward = forwardWeaponSteering(combatant, range, toward);
  return forward ? { heading: forward, strafe: travel } : { heading: travel };
}

export function moveCombatant(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  side: StrategicCombatSide,
  deltaSeconds: number,
  arena: StrategicCombatArenaOptions,
  activeMines: readonly MutableMine[]
): void {
  if (combatant.hullHp <= 0) {
    combatant.velocity.x = 0;
    combatant.velocity.y = 0;
    combatant.speed = 0;
    combatant.turnRateRadiansPerSecond = 0;
    combatant.angularThrust = 0;
    return;
  }

  const dx = enemy.position.x - combatant.position.x;
  const dy = enemy.position.y - combatant.position.y;
  const range = Math.max(1, Math.hypot(dx, dy));
  const toward = normalize(dx, dy);
  const desired = combatant.strategy?.desiredRange ?? preferredRange(combatant);
  const deliberateRam = usefulRamAttempt(combatant, enemy);
  if (!deliberateRam) delete combatant.ramApproach;
  const intent = chooseCombatFlightIntent(
    combatant,
    enemy,
    desired,
    arena,
    deltaSeconds,
    deliberateRam
  );
  let { direction } = intent;
  let targetSpeedFactor = intent.speedFactor;
  if (intent.kind === 'pass') combatant.combatIntent = 'ANGRIFFSPASSAGE';
  if (intent.kind === 'extend') combatant.combatIntent = 'ABSTAND GEWINNEN';

  const steering = steerCombatRoute(
    combatant,
    enemy,
    side,
    deltaSeconds,
    arena,
    activeMines,
    toward,
    deliberateRam,
    {
      direction,
      targetSpeedFactor,
      intentKind: intent.kind,
      ...(intent.destination ? { destination: intent.destination } : {}),
    }
  );
  direction = steering.direction;
  targetSpeedFactor = steering.targetSpeedFactor;

  const posture = chooseWeaponPosture({
    combatant,
    enemy,
    range,
    desired,
    toward,
    travel: direction,
    canAim: steering.canAim,
    deliberateRam,
  });
  const headingDirection = posture.heading;
  // RCS corrects the escape velocity before the hull completes its turn.
  const headingError = wrapAngle(Math.atan2(direction.y, direction.x) - combatant.headingRadians);
  const escapeStrafe = combatant.tactic === 'flee' && Math.abs(headingError) > 0.65;
  updateStandardCombatBoost(
    combatant,
    headingDirection,
    range,
    desired,
    targetSpeedFactor,
    deliberateRam,
    steering.clear,
    deltaSeconds
  );
  performCombatThrust(
    combatant,
    enemy,
    deltaSeconds,
    arena,
    headingDirection,
    targetSpeedFactor,
    escapeStrafe ? direction : posture.strafe
  );
}
