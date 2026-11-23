import type { WorldPoint } from '../core/world-types';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

interface FieldBody {
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly speed: number;
}

/** Take a detached pose from the field owner at the instant combat takes ownership. */
export function fieldCombatPose(body?: FieldBody | null) {
  if (!body) return {};
  const { position, headingRadians, speed } = body;
  return {
    position: { ...position },
    headingRadians,
    velocity: { x: Math.cos(headingRadians) * speed, y: Math.sin(headingRadians) * speed },
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
    }),
    ...(second.position && {
      defenderPosition: second.position,
      defenderHeadingRadians: second.headingRadians,
      defenderVelocity: second.velocity,
    }),
    ...(attacker === 'player' &&
      mining?.instance.sourceLocationId === location && {
        attackerVelocity: context.state.localSpace!.getShipWorldVelocity(),
      }),
  };
}
