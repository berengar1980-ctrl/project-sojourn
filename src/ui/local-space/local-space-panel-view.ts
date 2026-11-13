import { updateLongRangeScanButton } from '../local-operations/local-operations-hud';
import { updateCombatGrappleButton } from '../combat/combat-grapple-controls';
import { playerAtLocalExit } from '../map/local-space-exit-gate';
import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';

import { type createMiningEventPanel } from './mining-event-panel';

import { type MiningResourceSelector } from './mining-resource-selector';

import {
  type localSpaceControls,
  type createIntegrityTracker,
  type createScanCompletionTracker,
} from './local-space-panel-controls';

function miningStatus(model: LocalSpaceViewModel): string {
  if (model.miningEvent) return 'MINING PAUSIERT · ENTSCHEIDUNG ERFORDERLICH';
  if (model.miningRecoverySeconds > 0) {
    return 'MINING-SYSTEME NEUSTART · ' + Math.ceil(model.miningRecoverySeconds) + ' s';
  }
  if (model.longRangeScanProgress != null) {
    return 'FERNBEREICHSSCAN · ' + Math.round(model.longRangeScanProgress * 100) + ' %';
  }
  if (model.shortRangeScanProgress != null) {
    return 'NAHBEREICHSSCAN · ' + Math.round(model.shortRangeScanProgress * 100) + ' %';
  }
  if (model.navigationTarget) return 'NAVIGATION ZUM ZIELPUNKT';
  if (model.scanTarget && model.miningPhase === 'approaching') {
    return 'ANFLUG FÜR NAHBEREICHSSCAN';
  }
  if (model.miningPhase === 'approaching') return 'ANFLUG AUF ABBAUPOSITION';
  if (model.miningPhase === 'extracting') return 'MINING AKTIV';
  return '';
}

function asteroidStatus(model: LocalSpaceViewModel): string {
  const asteroid = model.selectedAsteroid;
  if (!asteroid) return '';
  if (asteroid.registeredOre?.length && asteroid.scanLevel !== 'analyzed') {
    return 'KONZESSIONSREGISTER · ' + asteroid.registeredOre.map(
      (ore) => ore.resourceName + ' ~' + Math.round(ore.amount) + ' t'
    ).join(' / ') + ' · MENGEN MOEGLICHERWEISE VERALTET';
  }

  if (asteroid.scanLevel === 'unscanned') {
    const identified = asteroid.deposits
      .map((deposit) => deposit.resourceName)
      .filter((name): name is string => name !== null);
    return identified.length > 0
      ? 'NICHT GESCANNT · GEFUNDEN: ' + identified.join(' / ')
      : 'NICHT GESCANNT';
  }

  if (asteroid.scanLevel === 'surveyed') {
    if (asteroid.surveyResult === 'empty') return 'KEINE RESSOURCE ERKANNT';
    return asteroid.deposits.map((deposit) => deposit.resourceName ?? '???').join(' / ');
  }

  if (asteroid.deposits.length === 0) return 'ANALYSE · KEINE RESSOURCE';
  return asteroid.deposits
    .map((deposit) => {
      const name = deposit.resourceName ?? '???';
      return name + ' · GESCHÄTZT ~' + Math.round(deposit.estimatedAmount ?? 0);
    })
    .join(' / ');
}

function renderCargo(model: LocalSpaceViewModel, total: HTMLElement, list: HTMLElement): void {
  total.textContent = Math.round(model.collectedOre).toString();
  list.replaceChildren();

  if (model.cargoResources.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'local-cargo-empty';
    empty.textContent = 'LEER';
    list.append(empty);
    return;
  }

  for (const resource of model.cargoResources) {
    const row = document.createElement('div');
    row.className = 'local-cargo-row';
    const name = document.createElement('span');
    const amount = document.createElement('strong');
    name.textContent = resource.name.toUpperCase();
    amount.textContent = Math.round(resource.amount).toString();
    row.append(name, amount);
    list.append(row);
  }
}

function updateMiningButton(
  button: HTMLButtonElement,
  model: LocalSpaceViewModel,
  miningActive: boolean
): void {
  const selected = model.selectedAsteroid;
  if (!selected) return;

  const knownEmpty = selected.scanLevel !== 'unscanned' && selected.surveyResult === 'empty';
  const targetedRemaining =
    model.miningResourceSelection === null
      ? (selected.totalRemaining ?? 0) > 0
      : selected.deposits.some(
          (deposit) =>
            deposit.resourceId !== null &&
            model.miningResourceSelection?.includes(deposit.resourceId) &&
            (deposit.estimatedAmount ?? 0) > 0
        );
  const depleted = selected.scanLevel === 'analyzed' && !targetedRemaining;
  button.textContent = model.miningAvailable ? 'MINING STARTEN' : 'MINING NICHT VERFÜGBAR';
  button.title = model.miningAvailable
    ? ''
    : 'Dieses Schiff hat kein einsatzfähiges Mining-System.';
  button.disabled =
    !model.miningAvailable || knownEmpty || depleted || (selected.isMiningTarget && miningActive);
}

interface LocalOverlayContext {
  readonly model: LocalSpaceViewModel;
  readonly controls: ReturnType<typeof localSpaceControls>;
  readonly trackIntegrity: ReturnType<typeof createIntegrityTracker>;
  readonly trackScanCompletion: ReturnType<typeof createScanCompletionTracker>;
  readonly miningEventPanel: ReturnType<typeof createMiningEventPanel>;
  readonly miningResourceSelector: MiningResourceSelector;
}

function updateLocalExitButton(
  button: HTMLButtonElement,
  model: LocalSpaceViewModel,
  eventActive: boolean
): void {
  const atExit = playerAtLocalExit(
    model.ship.position,
    model.width,
    model.height,
    model.backgroundSeed
  );
  button.disabled = eventActive || !atExit;
  button.title = atExit ? 'Zur Sternkarte wechseln' : 'Zuerst den markierten Ausgang anfliegen';
}

function showEmptyMiningSelection(
  card: HTMLElement,
  name: HTMLElement,
  meta: HTMLElement,
  oreBar: HTMLElement,
  scanButton: HTMLButtonElement,
  mineButton: HTMLButtonElement
): void {
  const kind = card.querySelector<HTMLElement>('.local-selection-kind');
  if (kind) kind.textContent = 'MINING // ZIELAUSWAHL';
  name.textContent = 'ASTEROID AUSWÄHLEN';
  meta.textContent = '1 · FERNBEREICHSSCAN  2 · KONTAKT WÄHLEN  3 · NAHBEREICHSSCAN';
  oreBar.style.width = '0%';
  scanButton.hidden = true;
  mineButton.hidden = true;
}

export function updateLocalOverlay(context: LocalOverlayContext): void {
  const {
    model,
    controls,
    trackIntegrity,
    trackScanCompletion,
    miningEventPanel,
    miningResourceSelector,
  } = context;
  const {
    canvas,
    card,
    name,
    meta,
    oreBar,
    mineButton,
    claimButton,
    shortScanButton,
    attackButton,
    longScanButton,
    cancelButton,
    backButton,
    status,
    cargoTotal,
    cargoList,
    combatTactics,
  } = controls;

  const selectedNpc = model.npcShips.find((npc) => npc.isSelected);
  combatTactics.hidden = model.combat === null;
  updateCombatGrappleButton(combatTactics, model.combat);
  for (const button of combatTactics.querySelectorAll<HTMLButtonElement>('[data-tactic]')) {
    button.classList.toggle('is-active', button.dataset.tactic === model.combat?.attacker.tactic);
  }
  const selected = model.selectedAsteroid;
  claimButton.hidden = !selected || selected.scanLevel !== 'analyzed' || selected.totalRemaining === 0 || Boolean(model.selectedAsteroidClaimOwner && model.selectedAsteroidClaimOwner !== 'player');
  claimButton.textContent = model.selectedAsteroidClaimOwner === 'player' ? 'KONZESSION AUFGEBEN' : 'KONZESSION REGISTRIEREN · 2.500 CR';
  const miningActive = model.miningPhase !== 'idle';
  const eventActive = model.miningEvent !== null;
  trackScanCompletion(model);
  miningEventPanel.update(model.miningEvent, model.miningRecoverySeconds);
  canvas.classList.toggle('is-locked', eventActive);
  card.hidden = false;
  cancelButton.hidden = !miningActive;
  cancelButton.disabled = eventActive;
  updateLocalExitButton(backButton, model, eventActive);
  renderCargo(model, cargoTotal, cargoList);
  updateLongRangeScanButton(
    longScanButton,
    model.scanAvailable,
    model.longRangeScanProgress,
    eventActive
  );

  trackIntegrity(model);

  const statusText = miningStatus(model);
  status.hidden = statusText.length === 0;
  status.textContent = statusText;

  if (selectedNpc) {
    const kind = card.querySelector<HTMLElement>('.local-selection-kind');
    if (kind) kind.textContent = 'SCHIFF';
    name.textContent = selectedNpc.name;
    meta.textContent = model.combat
      ? 'GEFECHT · SCHILD ' +
        Math.round(model.combat.defender.shieldHp) +
        ' · HÜLLE ' +
        Math.round(model.combat.defender.hullHp)
      : 'SCHIFF · ' + selectedNpc.phase.toUpperCase();
    oreBar.style.width = '100%';
    shortScanButton.hidden = true;
    mineButton.hidden = true;
    attackButton.hidden = model.combat !== null;
    miningResourceSelector.update(model, true, false);
    return;
  }
  attackButton.hidden = true;
  shortScanButton.hidden = false;
  mineButton.hidden = false;
  if (!selected) {
    showEmptyMiningSelection(card, name, meta, oreBar, shortScanButton, mineButton);
    miningResourceSelector.update(model, true, false);
    return;
  }
  const kind = card.querySelector<HTMLElement>('.local-selection-kind');
  if (kind) kind.textContent = 'ASTEROID';
  name.textContent =
    selected.scanLevel === 'analyzed' && selected.deposits.length > 0
      ? 'ASTEROID · ' + selected.deposits.length + ' VORKOMMEN'
      : 'ASTEROID';
  meta.textContent = asteroidStatus(model) + (model.selectedAsteroidClaimOwner ? ' · KONZESSION: ' + (model.selectedAsteroidClaimOwner === 'player' ? 'EIGEN' : 'FREMD') : '');
  const remaining =
    selected.totalCapacity && selected.totalRemaining != null
      ? (selected.totalRemaining / selected.totalCapacity) * 100
      : 0;
  oreBar.style.width = Math.max(0, remaining) + '%';
  miningResourceSelector.update(model, eventActive);
  shortScanButton.disabled =
    eventActive || !model.scanAvailable || miningActive || selected.scanLevel === 'analyzed';
  updateMiningButton(mineButton, model, miningActive);
}
