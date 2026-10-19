/** Mode-aware output and demand; idle industry is shed in combat. */
export interface CombatPowerBudget {
  readonly output: number;
  readonly combat: number;
  readonly industrial: number;
  readonly total: number;
  readonly shedInCombat: number;
}
