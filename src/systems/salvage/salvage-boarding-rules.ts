import type { BoardingEncounterSnapshot } from '../../core/boarding-types';
import type { SalvageWreck, SalvageSectionVariant } from '../../core/salvage-types';

const WRECK_DECKS: Readonly<Record<SalvageSectionVariant, string>> = {
  'corridor-complex': 'wreck-corridors',
  'double-deck': 'wreck-double-deck',
  'engine-room': 'wreck-engine',
  'cargo-bay': 'wreck-cargo',
  'crew-quarters': 'wreck-quarters',
  bridge: 'wreck-bridge',
  'reactor-hall': 'wreck-reactor',
  medbay: 'wreck-medbay',
};

const WRECK_BRIEFINGS: Readonly<Record<SalvageSectionVariant, string>> = {
  'corridor-complex': 'Verzweigte Gänge und mehrere Schotts. Flanken und Rückwege absichern.',
  'double-deck': 'Zwei parallele Decks mit engen Verbindungen. Gegenfeuer beachten.',
  'engine-room': 'Maschinenblöcke unterbrechen die Sicht. Der Mittelgang bleibt gefährlich.',
  'cargo-bay': 'Frachtstapel bilden Deckung und enge Schusskorridore.',
  'crew-quarters': 'Abgetrennte Kabinen und Schotts erfordern methodisches Vorrücken.',
  bridge: 'Die Brücke bietet freie Schusslinien um die Steuerstände.',
  'reactor-hall': 'Der Reaktorkern erzwingt einen Weg über die Außenringe.',
  medbay: 'Isolationsschotts teilen die Station in mehrere Räume.',
};

export function wreckRequiresBoarding(wreck: SalvageWreck): boolean {
  // An abandoned deck still requires a final clearance after all defenders fell on retreat.
  return (wreck.boardingHostiles ?? 0) > 0 && wreck.boardingCleared !== true;
}

export function wreckCanBoard(wreck: SalvageWreck): boolean {
  return wreck.inspected && wreckRequiresBoarding(wreck);
}

export function wreckDefenderCount(wreck: SalvageWreck): number {
  return Math.min(
    wreck.boardingHostiles ?? 0,
    Math.max(0, wreck.boardingHostilesRemaining ?? wreck.boardingHostiles ?? 0)
  );
}

export function boardingMapForWreck(wreck: SalvageWreck): string {
  return wreck.sectionVariant ? WRECK_DECKS[wreck.sectionVariant] : 'long-corridor';
}

export function boardingBriefingForWreck(wreck: SalvageWreck): string {
  const section = wreck.sectionVariant
    ? WRECK_BRIEFINGS[wreck.sectionVariant]
    : 'Unbekannte Rumpfstruktur. Vor der Bergung muss der Innenraum gesichert werden.';
  return section + ' · Verteidiger: ' + wreckDefenderCount(wreck);
}

/** Apply only the already-resolved tactical outcome to the original persistent wreck. */
export function recordWreckBoardingOutcome(
  wreck: SalvageWreck,
  snapshot: BoardingEncounterSnapshot
): { readonly defeated: number; readonly remaining: number; readonly secured: boolean } {
  if (snapshot.outcome === 'active') {
    return { defeated: 0, remaining: wreckDefenderCount(wreck), secured: false };
  }
  const before = wreckDefenderCount(wreck);
  const remaining = Math.min(
    before,
    snapshot.units.filter((unit) => unit.team === 'enemy' && unit.hp > 0).length
  );
  wreck.boardingHostilesRemaining = remaining;
  wreck.boardingAttempts = (wreck.boardingAttempts ?? 0) + 1;
  wreck.boardingLastOutcome = snapshot.outcome;
  if (snapshot.outcome === 'player_win') wreck.boardingCleared = true;
  return { defeated: before - remaining, remaining, secured: wreck.boardingCleared === true };
}
