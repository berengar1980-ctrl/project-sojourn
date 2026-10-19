/** One reactor budget with separate active operating modes; values are MW. */
export interface ShipPowerBudget {
  readonly output: number;
  readonly combat: number;
  readonly travel: number;
  readonly mining: number;
  readonly salvage: number;
  readonly industrial: number;
  readonly total: number;
  readonly shedInCombat: number;
}
