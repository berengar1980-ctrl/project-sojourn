import type { CombatWreckVariant, SalvageField, SalvageWreck } from '../../core/salvage-types';

const COMBAT_WRECK_MODELS = [
  'miner',
  'freighter',
  'patrol',
] as const satisfies readonly CombatWreckVariant[];

/** One random recoverable wreck per destroyed ship; unrelated to the destroyed ship's class. */
export function addDestroyedShipWreck(
  field: SalvageField,
  ship: {
    readonly id: string;
    readonly position: { readonly x: number; readonly y: number };
    readonly hullHp: number;
  },
  encounterId: string,
  random: () => number = Math.random
): SalvageWreck | null {
  if (ship.hullHp > 0) return null;
  const id = `combat-wreck-${encounterId}-${ship.id}`;
  const existing = field.wrecks.find((wreck) => wreck.id === id);
  if (existing) return existing;
  const roll = Math.min(0.999999, Math.max(0, random()));
  const index = Math.floor(roll * COMBAT_WRECK_MODELS.length);
  const combatWreckVariant = COMBAT_WRECK_MODELS[index]!;
  const names = [
    'Aufgerissene Maschinenrumpfsektion',
    'Zerborstene Frachthülle',
    'Abgerissener Kommandorumpf',
  ] as const;
  const seed = Math.floor(random() * 0x7fffffff);
  const angle = random() * Math.PI * 2;
  const quality = (1 + Math.floor(random() * 3)) as 1 | 2 | 3;
  const amount = 8 + quality * 7;
  const wreck: SalvageWreck = {
    id,
    name: names[index]!,
    // Salvage kind describes the recoverable hull, not the victim's ship role.
    kind: 'salvager',
    quality,
    combatWreckVariant,
    effectSeed: seed,
    position: {
      x: Math.max(45, Math.min(field.width - 45, ship.position.x)),
      y: Math.max(45, Math.min(field.height - 45, ship.position.y)),
    },
    radius: 20 + quality * 3,
    rotation: angle,
    rotation3d: { x: random() * 0.4, y: random() * 0.4, z: angle },
    spin3d: { x: 0.015, y: 0.02, z: 0.012 },
    driftVelocity: { x: Math.cos(angle) * 0.7, y: Math.sin(angle) * 0.7 },
    integrity: Math.max(12, Math.round(25 + random() * 30)),
    resources: [
      { resourceId: 'steel', initialAmount: amount, remainingAmount: amount },
      { resourceId: 'machine-parts', initialAmount: quality * 4, remainingAmount: quality * 4 },
      { resourceId: 'composite-plate', initialAmount: quality * 3, remainingAmount: quality * 3 },
    ],
    component: null,
    componentStatus: 'none',
    inspected: false,
    scanLevel: 'unscanned',
  };
  field.wrecks.push(wreck);
  return wreck;
}
