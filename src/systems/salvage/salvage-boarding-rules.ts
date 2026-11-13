import type { SalvageWreck, SalvageSectionVariant } from '../../core/salvage-types';

export function wreckRequiresBoarding(wreck: SalvageWreck): boolean {
  return (wreck.boardingHostiles ?? 0) > 0 && wreck.boardingCleared !== true;
}

export function wreckCanBoard(wreck: SalvageWreck): boolean {
  return wreck.inspected && wreckRequiresBoarding(wreck);
}

export function boardingMapForWreck(wreck: SalvageWreck): string {
  const variant: SalvageSectionVariant | undefined = wreck.sectionVariant;
  if (variant === 'double-deck' || variant === 'reactor-hall' || variant === 'cargo-bay') {
    return 'central-breach';
  }
  if (variant === 'engine-room' || variant === 'bridge' || variant === 'medbay') {
    return 'bulkhead-door';
  }
  return 'long-corridor';
}
