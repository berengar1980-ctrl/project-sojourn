import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';

function renderBuyerHints(
  scanner: StarMapViewModel['cargoScanner'],
  selectedResource: string,
  container: HTMLElement,
  onNavigate: (locationId: string) => void,
  selectedDestinationId: string | null
): void {
  const hints = (scanner?.hints ?? []).filter((hint) => {
    if (selectedResource === 'all') return true;
    return hint.resourceIds.includes(selectedResource);
  });
  if (hints.length) {
    const heading = document.createElement('p');
    heading.textContent = 'MÖGLICHE KÄUFER // NACHFRAGEPROFIL (KEINE LIVEPREISE)';
    container.append(heading);
    if (selectedResource === 'all' && hints.length > 0) {
      const best = hints[0];
      const summary = document.createElement('strong');
      summary.textContent = best
        ? `BESTER VERMUTETER GESAMTMARKT: ${best.name} (${best.matchedQuantity} t mit besonderer Nachfrage)`
        : '';
      container.append(summary);
    }
    for (const hint of hints.slice(0, 5)) {
      const item = document.createElement('div');
      item.textContent = `${hint.name} · Nachfrage für ${hint.matchedQuantity} t deiner Fracht`;
      const route = document.createElement('button');
      route.type = 'button';
      route.textContent = hint.locationId === selectedDestinationId ? 'ZIEL AUSGEWÄHLT' : 'ROUTE SETZEN';
      route.className = 'cargo-route-button';
      route.title = 'Navigationsziel auf der Sternkarte auswählen';
      route.addEventListener('click', (event) => {
        event.stopPropagation();
        onNavigate(hint.locationId);
      });
      item.append(' ', route);
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
  cargoContent: HTMLElement,
  onNavigate: (locationId: string) => void,
  onVisualization: (markers: ReadonlyMap<string, 'best' | 'good' | 'low'>) => void
): () => void {
  const formatCredits = (value: number): string =>
    Math.round(value).toLocaleString('de-DE') + ' Cr';
  const renderCargoScanner = (): void => {
    const scanner = getModel().cargoScanner;
    cargoPanel.hidden = !preferredCargoVisible;
    cargoToggle.textContent = preferredCargoVisible ? 'FRACHT // AN' : 'FRACHT // AUS';
    if (!preferredCargoVisible) {
      onVisualization(new Map());
      return;
    }
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
    if (preferredCargoResource === 'all') {
      const complete = quotes.find((quote) => quote.coveredQuantity === quote.totalQuantity);
      if (complete) {
        const recommendation = document.createElement('strong');
        recommendation.textContent = `BESTER BEKANNTER GESAMTVERKAUF: ${complete.name} · ${formatCredits(complete.revenue)}`;
        cargoContent.append(recommendation);
      }
    }
    renderBuyerHints(
      scanner,
      preferredCargoResource,
      cargoContent,
      onNavigate,
      getModel().navigation.selectedDestinationId
    );
    const markers = new Map<string, 'best' | 'good' | 'low'>();
    const bestRevenue = Math.max(0, ...quotes.map((quote) => quote.revenue));
    for (const quote of quotes) {
      const fraction = bestRevenue > 0 ? quote.revenue / bestRevenue : 0;
      markers.set(quote.locationId, fraction >= 0.95 ? 'best' : fraction >= 0.7 ? 'good' : 'low');
    }
    const relevantHints = (scanner?.hints ?? []).filter((hint) =>
      preferredCargoResource === 'all' || hint.resourceIds.includes(preferredCargoResource)
    );
    relevantHints.forEach((hint, index) => {
      if (!markers.has(hint.locationId)) markers.set(hint.locationId, index === 0 ? 'best' : 'good');
    });
    onVisualization(markers);
    const legend = document.createElement('p');
    legend.className = 'cargo-market-legend';
    legend.textContent = '● GRÜN: beste Chance  ·  ● GELB: weitere Käufer  ·  ● ROT: niedriger Erlös';
    cargoContent.append(legend);
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
      const route = document.createElement('button');
      route.type = 'button';
      route.textContent = quote.locationId === getModel().navigation.selectedDestinationId
        ? 'ZIEL AUSGEWÄHLT'
        : 'ROUTE SETZEN';
      route.className = 'cargo-route-button';
      route.title = 'Navigationsziel auf der Sternkarte auswählen';
      route.addEventListener('click', (event) => {
        event.stopPropagation();
        onNavigate(quote.locationId);
      });
      row.append(info, price, route);
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
