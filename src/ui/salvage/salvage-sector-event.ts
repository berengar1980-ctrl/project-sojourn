import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import {
  distressTowWithinRange,
  DISTRESS_TOW_ATTACH_RANGE,
} from '../../systems/salvage/distress-tow-physics';

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
  const stage = event.distressStage ?? 'approach';
  const towInRange = !!wreck && distressTowWithinRange(model.ship.position, wreck.position);
  const towButton = towInRange
    ? '<button type="button" data-distress-action="tow">ABSCHLEPPEN</button>'
    : '<button type="button" data-distress-action="tow" disabled title="Zuerst den Havaristen anfliegen">GREIFHAKEN AUSSER REICHWEITE</button>';
  const towHint = towInRange
    ? ''
    : `<span>ANFLUG ERFORDERLICH · GREIFHAKENREICHWEITE ${DISTRESS_TOW_ATTACH_RANGE} m</span>`;
  const evacuate = '<button type="button" data-distress-action="evacuate">EVAKUIEREN</button>';

  let actions = '<span>EINSATZ ABGESCHLOSSEN</span>';
  if (stage === 'approach') {
    const underway =
      (model.phase === 'approaching' || model.phase === 'diagnosing') &&
      wreck?.isWorkTarget;
    actions = underway
      ? '<button type="button" data-distress-action="diagnose" disabled>' +
        (model.phase === 'diagnosing'
          ? 'TECHNISCHE DIAGNOSE · ' + Math.round((model.operationProgress ?? 0) * 100) + ' %'
          : 'ANFLUG ZUR DIAGNOSE') +
        '</button>'
      : '<button type="button" data-distress-action="diagnose">TECHNISCHE DIAGNOSE</button>';
  } else if (stage === 'diagnosed') {
    actions = [
      '<button type="button" data-distress-action="repair">NOTREPARATUR</button>',
      towButton,
      evacuate,
      towHint,
    ].join('');
  } else if (stage === 'tow_required') {
    actions = towButton + evacuate + towHint;
  } else if (stage === 'towing') {
    actions =
      '<span class="port-positive">SCHLEPPEN VORBEREITET · ZUM MARKIERTEN KARTENAUSGANG FLIEGEN</span>';
  } else if (stage === 'salvage_rights') {
    actions =
      '<span class="port-positive">BERGUNGSRECHTE ERTEILT · WRACK KANN AUSGESCHLACHTET WERDEN</span>';
  }

  container.innerHTML =
    '<strong>HILFERUF // HAVARIST</strong><span>SCHADEN: ' +
    damage +
    '</span><div class="sector-salvage-actions">' +
    actions +
    '</div>';
}
