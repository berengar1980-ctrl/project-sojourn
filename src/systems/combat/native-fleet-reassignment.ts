import type {
  MutableCombatant,
  StrategicCombatService,
  StrategicCombatSide,
} from './strategic-combat-types';

export type NativeFleetDriver = StrategicCombatSide | 'both';

interface FleetAssignment {
  readonly services: readonly StrategicCombatService[];
  readonly drivers: NativeFleetDriver[];
  readonly ships: readonly MutableCombatant[];
  readonly teams: ReadonlyMap<string, 'a' | 'b'>;
  readonly escaped: ReadonlySet<string>;
}

interface Engagement {
  readonly serviceIndex: number;
  readonly owner: MutableCombatant;
  readonly target: MutableCombatant;
  readonly side: StrategicCombatSide;
}

function actor(service: StrategicCombatService, side: StrategicCombatSide): MutableCombatant {
  const ship = service.getParallelActor?.(side);
  if (!ship) throw new Error('Fleet actor reference is missing');
  return ship;
}

function live(ship: MutableCombatant, context: FleetAssignment): boolean {
  return ship.hullHp > 0 && !context.escaped.has(ship.setup.id);
}

function enemy(a: MutableCombatant, b: MutableCombatant, context: FleetAssignment): boolean {
  return context.teams.get(a.setup.id) !== context.teams.get(b.setup.id);
}

/** Every physical ship has precisely one owning AI/physics driver. */
function activeEngagements(context: FleetAssignment): Engagement[] {
  const engagements: Engagement[] = [];
  for (const [index, service] of context.services.entries()) {
    if (service.getSnapshot().winner !== null) continue;
    const sides: readonly StrategicCombatSide[] =
      context.drivers[index] === 'both'
        ? ['attacker', 'defender']
        : [context.drivers[index] as StrategicCombatSide];
    for (const side of sides) {
      const owner = actor(service, side);
      const target = actor(service, side === 'attacker' ? 'defender' : 'attacker');
      if (!live(owner, context) || !live(target, context)) continue;
      engagements.push({ serviceIndex: index, owner, target, side });
    }
  }
  return engagements;
}

function freeCombatant(
  service: StrategicCombatService,
  driven: NativeFleetDriver,
  context: FleetAssignment
): { ship: MutableCombatant; side: StrategicCombatSide } | null {
  const state = service.getSnapshot();
  if (driven === 'both') {
    if (
      state.winner === null ||
      (state.outcomeReason !== 'destruction' && state.outcomeReason !== 'escape')
    )
      return null;
    const ship = actor(service, state.winner);
    return live(ship, context) ? { ship, side: state.winner } : null;
  }
  const side = driven;
  const ship = actor(service, side);
  const target = actor(service, side === 'attacker' ? 'defender' : 'attacker');
  if (!live(ship, context)) return null;
  // A settled duel or an opponent who has escaped in ANOTHER duel frees this ship.
  if (state.winner === null && live(target, context)) return null;
  if (state.outcomeReason === 'boarding' || state.outcomeReason === 'surrender') return null;
  return { ship, side };
}

function separation(a: MutableCombatant, b: MutableCombatant): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

interface TargetChoice {
  readonly opponent: MutableCombatant;
  /** One extra attacker can be peeled off a friendly 1v2 by changing ONLY its own target. */
  readonly intercept?: Engagement;
}

/** Prefer the nearest real encounter, but split a nearby overloaded 1v2. */
function chooseTarget(
  free: MutableCombatant,
  context: FleetAssignment,
  engagements: readonly Engagement[]
): TargetChoice | null {
  const opponents = context.ships
    .filter((ship) => live(ship, context) && enemy(free, ship, context))
    .sort((a, b) => separation(free, a) - separation(free, b));
  const nearest = opponents[0];
  if (!nearest) return null;

  const peel: { choice: TargetChoice; distance: number }[] = [];
  for (const friendly of engagements) {
    if (!live(friendly.owner, context) || friendly.owner === free) continue;
    if (enemy(free, friendly.owner, context)) continue;
    const secondaries = engagements.filter(
      (other) =>
        other.target === friendly.owner &&
        other.owner !== friendly.target &&
        other.owner !== free &&
        live(other.owner, context) &&
        context.drivers[other.serviceIndex] !== 'both'
    );
    for (const secondary of secondaries) {
      peel.push({
        choice: { opponent: secondary.owner, intercept: secondary },
        distance: separation(free, secondary.owner),
      });
    }
  }
  peel.sort((a, b) => a.distance - b.distance);
  const closestPeel = peel[0];
  // A nearby secondary attacker has priority. Do not cross the whole map to
  // peel one off when another fight is much closer.
  if (closestPeel && closestPeel.distance <= separation(free, nearest) * 1.3 + 120) {
    return closestPeel.choice;
  }
  return { opponent: nearest };
}

/**
 * A completed 1v1 becomes a 2v1 only when its REAL survivor joins a battle.
 * If the friendly ship is outnumbered, peel its secondary attacker into a
 * fresh 1v1 instead. All existing native ship/service instances are retained.
 */
export function reassignNativeFleetTargets(context: FleetAssignment): void {
  for (const [index, service] of context.services.entries()) {
    const available = freeCombatant(service, context.drivers[index]!, context);
    if (!available) continue;
    const choice = chooseTarget(available.ship, context, activeEngagements(context));
    if (!choice) continue;
    const assigned =
      context.drivers[index] === 'both'
        ? service.retargetParallelSurvivor?.(available.side, choice.opponent)
        : service.redirectParallelSupport?.(choice.opponent);
    if (!assigned) continue;
    context.drivers[index] = available.side;

    // The secondary attacker is already being simulated by its OWN service.
    // Redirect that service's target toward the arriving defender; do not
    // create a new service or advance any actor a second time.
    if (choice.intercept) {
      context.services[choice.intercept.serviceIndex]?.redirectParallelSupport?.(available.ship);
    }
  }
}
