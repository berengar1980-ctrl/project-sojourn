import type { WorldPoint } from '../core/world-types';
import type { PhysicalShipState } from '../core/physical-ship-state';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

interface FieldBody extends Pick<PhysicalShipState, 'position' | 'headingRadians'> {
  readonly speed?: number;
  readonly velocity?: WorldPoint;
  readonly turnRateRadiansPerSecond?: number;
  readonly angularThrust?: number;
  readonly lateralThrust?: number;
  readonly longitudinalThrust?: number;
}

/** Take a detached pose from the field owner at the instant combat takes ownership. */
export function fieldCombatPose(body?: FieldBody | null) {
  if (!body) return {};
  const { position, headingRadians } = body;
  return {
    position: { ...position },
    headingRadians,
    velocity: body.velocity
      ? { ...body.velocity }
      : {
          x: Math.cos(headingRadians) * (body.speed ?? 0),
          y: Math.sin(headingRadians) * (body.speed ?? 0),
        },
    maneuvering: {
      turnRateRadiansPerSecond: body.turnRateRadiansPerSecond ?? 0,
      angularThrust: body.angularThrust ?? 0,
      lateralThrust: body.lateralThrust ?? 0,
      longitudinalThrust: body.longitudinalThrust ?? 0,
    },
  };
}

export function fieldBattleMotion(
  context: ControllerRuntimeContext,
  location: string,
  attacker: string,
  defender: string
) {
  const mining = context.state.localSpace?.getSnapshot();
  const getBody = (id: string) => {
    const salvage = context.state.salvageScene;
    if (salvage?.getField().sourceLocationId === location) return salvage.body(id);
    if (id === 'player')
      return mining?.instance.sourceLocationId === location ? mining.instance.ship : undefined;
    if (id === 'security-drone:' + location) return context.economy.securityDrones?.get(location);
    return (
      context.economy.localPirates?.get(location)?.body(id) ??
      context.state.localNpcMining?.ships.find((ship) => ship.npcId === id)
    );
  };
  const first = fieldCombatPose(getBody(attacker));
  const second = fieldCombatPose(getBody(defender));
  return {
    ...(first.position && {
      attackerPosition: first.position,
      attackerHeadingRadians: first.headingRadians,
      attackerVelocity: first.velocity,
      attackerManeuvering: first.maneuvering,
    }),
    ...(second.position && {
      defenderPosition: second.position,
      defenderHeadingRadians: second.headingRadians,
      defenderVelocity: second.velocity,
      defenderManeuvering: second.maneuvering,
    }),
    ...(attacker === 'player' &&
      mining?.instance.sourceLocationId === location && {
        attackerVelocity: context.state.localSpace!.getShipWorldVelocity(),
      }),
  };
}
