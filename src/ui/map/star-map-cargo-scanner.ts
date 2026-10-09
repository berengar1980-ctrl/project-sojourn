import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';

function renderBuyerHints(
  scanner: StarMapViewModel['cargoScanner'],
  selectedResource: string,
  container: HTMLElement
): void {
  const hints = (scanner?.hints ?? []).filter((hint) => {
    if (selectedResource === 'all') return true;
    return hint.resourceIds.includes(selectedResource);
  });
  if (hints.length) {
    const heading = document.createElement('p');
    heading.textContent = 'MÖGLICHE KÄUFER // NACHFRAGEPROFIL (KEINE LIVEPREISE)';
    container.append(heading);
    for (const hint of hints.slice(0, 5)) {
      const item = document.createElement('div');
      item.textContent = `${hint.name} · Nachfrage für ${hint.matchedQuantity} t deiner Fracht`;
      container.append(item);
    }
  }
}

let preferredCargoVisible = false;
let preferredCargoResource = 'all';

export function bindCargoMarketScanner(
  getModel: () => StarMapViewModel,
  cargoToggle: HTMLButtonElement,
  cargoPanel: HTMLElement,
  cargoSelect: HTMLSelectElement,
  cargoContent: HTMLElement
): () => void {
  const formatCredits = (value: number): string =>
    Math.round(value).toLocaleString('de-DE') + ' Cr';
  const renderCargoScanner = (): void => {
    const scanner = getModel().cargoScanner;
    cargoPanel.hidden = !preferredCargoVisible;
    cargoToggle.textContent = preferredCargoVisible ? 'FRACHT // AN' : 'FRACHT // AUS';
    if (!preferredCargoVisible) return;
    const items = scanner?.resources ?? [];
    const previous = preferredCargoResource;
    cargoSelect.replaceChildren();
    const addOption = (value: string, label: string): void => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      cargoSelect.append(option);
    };
    addOption('all', 'GESAMTE FRACHT');
    for (const item of items) addOption(item.resourceId, item.name + ' (' + item.quantity + ')');
    preferredCargoResource =
      previous !== 'all' && items.some((item) => item.resourceId === previous) ? previous : 'all';
    cargoSelect.value = preferredCargoResource;
    cargoContent.replaceChildren();
    if (!items.length) {
      cargoContent.textContent =
        'Frachtraum leer. Nach dem Mining erscheinen hier deine Rohstoffe.';
      return;
    }
    const lead = document.createElement('div');
    lead.style.cssText = 'padding:6px 0;border-bottom:1px solid #344b58;margin-bottom:7px';
    lead.textContent = items.map((item) => item.name + ': ' + item.quantity).join(' · ');
    cargoContent.append(lead);
    const quotes =
      preferredCargoResource === 'all'
        ? (scanner?.markets ?? [])
        : (items.find((item) => item.resourceId === preferredCargoResource)?.markets ?? []);
    renderBuyerHints(scanner, preferredCargoResource, cargoContent);
    if (!quotes.length) {
      const empty = document.createElement('p');
      empty.textContent =
        'Noch keine bestätigten Verkaufspreise bekannt. Die Käuferhinweise oben basieren auf Nachfrageprofilen.';
      cargoContent.append(empty);
      return;
    }
    for (const quote of quotes.slice(0, 8)) {
      const row = document.createElement('div');
      row.style.cssText =
        'padding:8px 0;border-bottom:1px solid #273b46;display:flex;justify-content:space-between;gap:8px';
      const info = document.createElement('div');
      const name = document.createElement('div');
      name.textContent = quote.name;
      name.style.fontWeight = 'bold';
      const detail = document.createElement('small');
      detail.style.color = '#9baebb';
      detail.textContent =
        'Distanz ' +
        Math.round(quote.distance) +
        ' u · Daten ' +
        (scanner!.currentDay - quote.observedDay) +
        ' Tage alt' +
        (quote.coveredQuantity < quote.totalQuantity ? ' · UNVOLLSTÄNDIG' : '');
      info.append(name, detail);
      const price = document.createElement('strong');
      price.style.color = quote.coveredQuantity === quote.totalQuantity ? '#83cba7' : '#dfb16d';
      price.textContent = formatCredits(quote.revenue);
      row.append(info, price);
      cargoContent.append(row);
    }
  };
  cargoToggle.addEventListener('click', () => {
    preferredCargoVisible = !preferredCargoVisible;
    renderCargoScanner();
  });
  cargoSelect.addEventListener('change', () => {
    preferredCargoResource = cargoSelect.value;
    renderCargoScanner();
  });

  renderCargoScanner();
  return renderCargoScanner;
}
