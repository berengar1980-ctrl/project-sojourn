import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';

function number(value: number, fractionDigits = 1): string {
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function stopName(model: StarMapViewModel, id: string): string {
  return model.locations.find((location) => location.id === id)?.name ?? id;
}

function updateEmergencyButton(
  model: StarMapViewModel,
  element: HTMLElement,
  action?: () => void
): void {
  let button = element.querySelector<HTMLButtonElement>('.map-emergency-fuel');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-emergency-fuel';
    button.addEventListener('click', () => action?.());
    element.append(button);
  }
  const quote = model.fuelStatus?.emergencyQuote;
  button.hidden = !action || !quote || model.navigation.isTravelling;
  button.disabled = !quote || quote.units <= 0;
  button.textContent = quote?.units
    ? 'NOTBETANKUNG · +' + number(quote.units) + ' E · ' + number(quote.cost, 0) + ' CR'
    : 'NOTBETANKUNG · NICHT VERFÜGBAR';
}

export function updateStarMapFuelStatus(
  model: StarMapViewModel,
  element: HTMLElement,
  emergency?: () => void
): void {
  const fuel = model.fuelStatus;
  if (!fuel) {
    element.hidden = true;
    return;
  }
  element.hidden = false;
  element.classList.toggle('is-unreachable', fuel.unreachable);
  const lines = [
    'TREIBSTOFF  ' + number(fuel.fuel) + ' / ' + number(fuel.capacity) + ' E',
    'VERBRAUCH  ' + number(fuel.fuelPerHundred, 2) + ' E / 100 u',
  ];
  if (fuel.planned) {
    const route = fuel.planned;
    const names = route.stopIds.map((id) => stopName(model, id));
    const distance = number(route.totalDistance, 0);
    lines.push('ROUTE  ' + number(route.totalFuel) + ' E · ' + distance + ' u');
    lines.push('TANKSTOPPS  ' + (names.length ? names.join(' → ') : 'KEINE'));
    lines.push('UNTERWEGS TANKEN  ' + route.fuelCost.toLocaleString('de-DE') + ' CR');
    lines.push('ANKUNFTSRESERVE  ' + number(route.arrivalFuel) + ' E');
    if (fuel.estimatedSeconds !== undefined)
      lines.push('REISEZEIT (CA.)  ' + number(fuel.estimatedSeconds / 60, 0) + ' MIN');
  } else if (fuel.unreachable) {
    lines.push('ROUTE NICHT ERREICHBAR · REICHWEITE ODER CREDITS');
  }
  if (fuel.personalRisk) {
    const risk = fuel.personalRisk;
    lines.push('REGIONSGEFAHR  ' + risk.worldDanger + '/3 (DAUERHAFT)');
    lines.push(
      'FÜR DEIN SCHIFF  ' + ({ low: 'NIEDRIG', medium: 'MITTEL', high: 'HOCH' } as const)[risk.tier]
    );
    lines.push('ERFASSTE PIRATEN  ' + risk.contactCount);
  }
  let text = element.querySelector<HTMLElement>('.map-fuel-readout');
  if (!text) {
    text = document.createElement('div');
    text.className = 'map-fuel-readout';
    element.prepend(text);
  }
  text.textContent = lines.join('\n');
  updateEmergencyButton(model, element, emergency);
}
