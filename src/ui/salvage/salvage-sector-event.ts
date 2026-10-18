import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import {
  distressTowWithinRange,
  DISTRESS_TOW_ATTACH_RANGE,
} from '../../systems/salvage/distress-tow-physics';

function diagnosisAction(model: SalvageSpaceViewModel): string {
  const wreck = model.wrecks[0];
  const diagnosing = model.phase === 'diagnosing';
  const approaching = model.phase === 'approaching' && !!wreck?.isWorkTarget;
  const busy = model.phase !== 'idle';
  const progress = Math.round((model.operationProgress ?? 0) * 100);
  let caption = 'TECHNISCHE DIAGNOSE';
  if (diagnosing) caption = 'TECHNISCHE DIAGNOSE · ' + progress + ' %';
  else if (approaching) caption = 'ANFLUG ZUR DIAGNOSE';
  else if (!model.scanAvailable) caption = 'SCANSYSTEM FEHLT';
  else if (busy) caption = 'VORGANG LÄUFT';
  const disabled = busy || !model.scanAvailable ? ' disabled' : '';
  return `<button type="button" data-distress-action="diagnose"${disabled}>${caption}</button>`;
}

function distressActions(model: SalvageSpaceViewModel): string {
  const stage = model.sectorEvent?.distressStage ?? 'approach';
  if (stage === 'approach') return diagnosisAction(model);
  const wreck = model.wrecks[0];
  const towInRange = !!wreck && distressTowWithinRange(model.ship.position, wreck.position);
  const towButton = towInRange
    ? '<button type="button" data-distress-action="tow">ABSCHLEPPEN</button>'
    : '<button type="button" data-distress-action="tow" disabled title="Zuerst den Havaristen anfliegen">GREIFHAKEN AUSSER REICHWEITE</button>';
  const towHint = towInRange
    ? ''
    : `<span>ANFLUG ERFORDERLICH · GREIFHAKENREICHWEITE ${DISTRESS_TOW_ATTACH_RANGE} m</span>`;
  const evacuate = '<button type="button" data-distress-action="evacuate">EVAKUIEREN</button>';
  if (stage === 'diagnosed') {
    return [
      '<button type="button" data-distress-action="repair">NOTREPARATUR</button>',
      towButton,
      evacuate,
      towHint,
    ].join('');
  }
  if (stage === 'tow_required') return towButton + evacuate + towHint;
  if (stage === 'towing') {
    return '<span class="port-positive">SCHLEPPEN VORBEREITET · ZUM MARKIERTEN KARTENAUSGANG FLIEGEN</span>';
  }
  if (stage === 'salvage_rights') {
    return '<span class="port-positive">BERGUNGSRECHTE ERTEILT · WRACK KANN AUSGESCHLACHTET WERDEN</span>';
  }
  return '<span>EINSATZ ABGESCHLOSSEN</span>';
}

export function renderSectorEvent(model: SalvageSpaceViewModel, container: HTMLElement): void {
  const event = model.sectorEvent;
  const wreck = model.wrecks[0];
  const selectedDistress =
    event?.type === 'distress-rescue' && wreck?.id === model.selectedWreck?.id;
  container.hidden = !event || (event.type === 'distress-rescue' && !selectedDistress);
  if (!event || container.hidden) {
    container.replaceChildren();
    return;
  }
  if (event.type === 'special-wreck') {
    container.innerHTML =
      '<strong>SELTENES BERGUNGSSIGNAL</strong><span>Dieses Wrack kann eine modifizierte Schiffskomponente enthalten.</span>';
    return;
  }

  const damage = event.distressDamage?.replaceAll('_', ' ').toUpperCase() ?? 'UNBEKANNT';
  container.innerHTML =
    '<strong>HILFERUF // HAVARIST</strong><span>SCHADEN: ' +
    damage +
    '</span><div class="sector-salvage-actions">' +
    distressActions(model) +
    '</div>';
}
