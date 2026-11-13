import type { ShipDefinition } from '../core/ship-types';
import type { sectorPortByLocationId } from '../data/ports/sector-ports';
import type { resolveShipRuntimeSetup } from '../systems/ships';
import { repairCost, type ShipOperatingService } from '../systems/ships/ship-operating-costs';

type PortDefinition = NonNullable<ReturnType<typeof sectorPortByLocationId>>;
type Runtime = ReturnType<typeof resolveShipRuntimeSetup>;

/** Preview a repair without modifying hull state or charging the player. */
export function portOperatingView(
  ship: ShipDefinition,
  runtime: Runtime,
  port: PortDefinition,
  shipOperations: ShipOperatingService
) {
  const condition = shipOperations.snapshot(ship, runtime.hullMaxHp);
  const engineering = runtime.crewEffects.engineering.repairCostMultiplier;
  const estimate = shipOperations.repairEstimate(
    ship, runtime.hullMaxHp, port.shipyard, engineering
  );
  return {
    ...condition,
    repairPrice: repairCost(condition.hullMaxHp - condition.hullHp, port.shipyard, engineering),
    repairPoints: estimate.points,
    affordableRepairCost: estimate.cost,
    shipyardDiscount: port.shipyard,
  };
}
