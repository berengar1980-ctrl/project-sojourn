import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import type { localSpaceControls } from './local-space-panel-controls';

/** A combat wreck is a selectable salvage target, not an ore asteroid. */
export function showLocalCombatWreckSelection(
  controls: ReturnType<typeof localSpaceControls>,
  model: LocalSpaceViewModel,
  selectedWreckId: string | null
): void {
  if (!selectedWreckId) return;
  const wreck = model.combatWrecks?.find((item) => item.id === selectedWreckId);
  if (!wreck) return;
  const kind = controls.card.querySelector<HTMLElement>('.local-selection-kind');
  if (kind) kind.textContent = 'BERGUNG // KAMPFWRACK';
  controls.name.textContent = wreck.name;
  const remaining = wreck.resources.reduce((sum, item) => sum + item.remainingAmount, 0);
  const initial = wreck.resources.reduce((sum, item) => sum + item.initialAmount, 0);
  const resources = wreck.resources
    .filter((item) => item.remainingAmount > 0)
    .map((item) => item.resourceId.toUpperCase() + ' ' + Math.round(item.remainingAmount) + ' t')
    .join(' · ');
  controls.meta.textContent = remaining > 0
    ? 'BERGBAR · ' + resources + ' · BERGUNGSSCHIFF ERFORDERLICH'
    : 'VOLLSTÄNDIG VERWERTET';
  controls.oreBar.style.width = (initial > 0 ? Math.min(100, 100 * remaining / initial) : 0) + '%';
  controls.mineButton.hidden = true;
  controls.shortScanButton.hidden = true;
  controls.claimButton.hidden = true;
  controls.attackButton.hidden = true;
  controls.resourceSelector.hidden = true;
}
