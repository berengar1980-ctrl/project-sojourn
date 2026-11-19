/** Local civilian collider seen by native PvP, never an extra combat target. */
export interface StrategicCombatBystander {
  readonly id: string;
  readonly shipId: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly headingRadians: number;
}
