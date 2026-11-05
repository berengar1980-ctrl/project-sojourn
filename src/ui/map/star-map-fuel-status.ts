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

export function updateStarMapFuelStatus(model: StarMapViewModel, element: HTMLElement): void {
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
  } else if (fuel.unreachable) {
    lines.push('ROUTE NICHT ERREICHBAR · REICHWEITE ODER CREDITS');
  }
  element.textContent = lines.join('\n');
}
