import { resolveLayeredHit } from '../../core/layered-damage';
import type {
  LayeredDamageResult,
  ShipIntegrityState,
  ShipMineDefinition,
} from '../../core/combat-types';

export function resolveShipMineHit(
  mine: ShipMineDefinition,
  target: ShipIntegrityState
): LayeredDamageResult {
  return resolveLayeredHit(target, mine.shieldDamage, mine.hullDamage);
}
