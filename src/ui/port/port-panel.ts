import type { PortTab } from '../../core/port-types';
import type { ShipComponentType } from '../../core/ship-types';
import type { PortViewModel } from '../../features/port/port-view-model';
import { PortLocationRenderer } from './port-location-renderer';
import './port-shipyard.css';
import { bindShipyardBrowser } from './port-shipyard-browser';
import { crewPane, equipmentPane, shipPane, shipyardPane } from './port-secondary-panes';

export interface PortPanel {
  destroy(): void;
}

let lastPortTab: PortTab = 'trade';

interface PortPanelOptions {
  readonly root: HTMLElement;
  readonly model: PortViewModel;
  readonly onReturnToStarMap: () => void;
  readonly onMarketRoute: (locationId: string) => void;
  readonly onBuy: (resourceId: string) => void;
  readonly onSell: (resourceId: string) => void;
  readonly onSellAll: (resourceId: string) => void;
  readonly onSetComponentSlot: (
    type: ShipComponentType,
    index: number,
    componentId: string | null
  ) => void;
  readonly onHireCrew: (crewId: string) => void;
  readonly onAssignCrew: (stationId: string, crewId: string | null) => void;
  readonly onSellLooseComponent: (uid: string) => void;
  readonly onBuyShipyardVariant: (type: ShipComponentType, componentId: string) => void;
  readonly onBuyShip: (id: string) => void;
}

function credits(value: number): string {
  const sign = value > 0 ? '+' : '';
  return sign + Math.round(value).toLocaleString('de-DE') + ' CR';
}

function priceBand(pressurePercent: number): { label: string; className: string } {
  if (pressurePercent <= -22) return { label: 'SEHR BILLIG', className: 'very-cheap' };
  if (pressurePercent <= -8) return { label: 'BILLIG', className: 'cheap' };
  if (pressurePercent < 8) return { label: 'NORMAL', className: 'normal' };
  if (pressurePercent < 22) return { label: 'TEUER', className: 'expensive' };
  return { label: 'SEHR TEUER', className: 'very-expensive' };
}

function marketExpectation(expectation: 'cheap' | 'neutral' | 'expensive'): string {
  if (expectation === 'cheap') return 'EHER GÜNSTIG';
  if (expectation === 'expensive') return 'EHER TEUER';
  return 'NORMAL';
}

function marketRows(model: PortViewModel): string {
  return model.market
    .map((row) => {
      const band = priceBand(row.pressurePercent);
      return `
        <div class="port-market-row" data-market-id="${row.id}">
          <span class="port-market-name">${row.name}<small class="port-legality port-legality--${row.legality}">${row.legalityLabel}</small><small class="port-owned">FRACHT ${row.owned}</small></span>
          <div class="port-market-price"><strong>${row.buyPrice.toLocaleString('de-DE')} CR</strong><small class="port-price-band port-price-band--${band.className}">${band.label}</small></div>
          <span>${row.stock.toLocaleString('de-DE')}</span>
          <span class="port-demand port-demand--${row.demandLabel.replace(' ', '-')}">${row.demandLabel}</span>
          <span>${row.productionLabel}</span>
          <button class="port-buy" type="button" data-buy-id="${row.id}">+1 KAUFEN</button>
          <button class="port-sell" type="button" data-sell-id="${row.id}" ${row.owned > 0 ? '' : 'disabled'}>-1 VERKAUFEN</button>
        </div>
      `;
    })
    .join('');
}

function cargoSaleRows(model: PortViewModel): string {
  if (model.cargoSales.length === 0) {
    return '<div class="port-info-box">Frachtraum leer. Kaufe, mine oder berge Waren, um Verkaufschancen zu vergleichen.</div>';
  }
  return model.cargoSales
    .map((cargo) => {
      const bestLine = cargo.bestIsHere
        ? '<b>BESTER BEKANNTER MARKT: HIER</b>'
        : `<b>${cargo.bestLocationName}</b><small>${cargo.bestSellPrice.toLocaleString('de-DE')} CR/t · ${cargo.bestAgeDays === 0 ? 'LIVE' : cargo.bestAgeDays + ' T ALT'}</small>`;
      return `
        <article class="port-cargo-sale port-cargo-sale--${cargo.rating}">
          <div class="port-cargo-sale-main">
            <strong>${cargo.name}</strong>
            <small>${cargo.quantity} t · Ø EK ${Math.round(cargo.averageCost).toLocaleString('de-DE')} CR/t</small>
          </div>
          <div><span>HIER</span><strong>${cargo.localSellPrice.toLocaleString('de-DE')} CR/t</strong><small class="${cargo.localProfit >= 0 ? 'port-positive' : 'port-negative'}">${credits(cargo.localProfit)}</small></div>
          <div class="port-cargo-sale-best"><span>BESTER BEKANNTER VERKAUF</span>${bestLine}<small class="${cargo.bestProfit >= 0 ? 'port-positive' : 'port-negative'}">${credits(cargo.bestProfit)}</small></div>
          <div class="port-cargo-sale-actions">
            <button type="button" data-sell-id="${cargo.resourceId}">1 t VERKAUFEN</button>
            <button type="button" data-sell-all-id="${cargo.resourceId}">ALLES VERKAUFEN</button>
            ${cargo.bestIsHere ? '' : `<button type="button" data-market-route="${cargo.bestLocationId}">ZUM BESTEN MARKT</button>`}
          </div>
        </article>
      `;
    })
    .join('');
}

type SystemMarketRow = PortViewModel['systemMarket'][number];

function knownSystemRows(rows: readonly SystemMarketRow[]): readonly SystemMarketRow[] {
  return rows.filter((row) => row.price !== null && row.sellPrice !== null && row.ageDays !== null);
}

function bestSystemBuy(rows: readonly SystemMarketRow[]): SystemMarketRow | undefined {
  return [...knownSystemRows(rows)].sort(
    (a, b) => (a.price ?? 0) - (b.price ?? 0) || (a.ageDays ?? 0) - (b.ageDays ?? 0)
  )[0];
}

function bestSystemSell(rows: readonly SystemMarketRow[]): SystemMarketRow | undefined {
  return [...knownSystemRows(rows)].sort(
    (a, b) => (b.sellPrice ?? 0) - (a.sellPrice ?? 0) || (a.ageDays ?? 0) - (b.ageDays ?? 0)
  )[0];
}

function systemRouteControl(
  row: SystemMarketRow,
  currentLocationId: string,
  label: string
): string {
  return row.locationId === currentLocationId
    ? '<em class="port-system-summary-current">HIER</em>'
    : `<button type="button" data-market-route="${row.locationId}">${label}</button>`;
}

function systemPriceSummary(
  title: string,
  row: SystemMarketRow | undefined,
  currentLocationId: string,
  mode: 'buy' | 'sell',
  expectedLocation: string | null
): string {
  const value = mode === 'buy' ? row?.price : row?.sellPrice;
  if (row && value !== null && value !== undefined && row.ageDays !== null) {
    const age = row.ageDays === 0 ? 'LIVE' : row.ageDays + ' T ALT';
    const routeLabel = mode === 'buy' ? 'ZUM EINKAUF' : 'ZUM VERKAUF';
    return `<div><span>${title}</span><strong>${row.locationName}</strong><b>${value.toLocaleString('de-DE')} CR/t</b><small>${age}</small>${systemRouteControl(row, currentLocationId, routeLabel)}</div>`;
  }
  const hint = expectedLocation
    ? 'Profil-Hinweis: ' + expectedLocation
    : 'Sensorintel oder Besuch nötig';
  return `<div><span>${title}</span><strong>KEINE PREISDATEN</strong><small>${hint}</small></div>`;
}

function systemMarginSummary(
  buy: SystemMarketRow | undefined,
  sell: SystemMarketRow | undefined
): string {
  if (buy?.price === null || buy?.price === undefined) {
    return '<div><span>GESCHÄTZTE MARGE</span><strong>UNBEKANNT</strong><small>keine erfundene Preisprognose</small></div>';
  }
  if (sell?.sellPrice === null || sell?.sellPrice === undefined) {
    return '<div><span>GESCHÄTZTE MARGE</span><strong>UNBEKANNT</strong><small>keine erfundene Preisprognose</small></div>';
  }
  const margin = sell.sellPrice - buy.price;
  const percent = buy.price === 0 ? 0 : Math.round((margin / buy.price) * 100);
  const tone = margin >= 0 ? 'port-positive' : 'port-negative';
  const marginSign = margin >= 0 ? '+' : '';
  const percentSign = percent >= 0 ? '+' : '';
  return `<div><span>GESCHÄTZTE MARGE</span><strong class="${tone}">${marginSign}${margin.toLocaleString('de-DE')} CR/t</strong><b class="${tone}">${percentSign}${percent}%</b><small>vor Gebühren/Fuel</small></div>`;
}

function systemResourceSummary(model: PortViewModel, resourceId: string, initial: string): string {
  const rows = model.systemMarket.filter((row) => row.resourceId === resourceId);
  if (rows.length === 0) return '';
  const buy = bestSystemBuy(rows);
  const sell = bestSystemSell(rows);
  const expectedBuy = rows.find((row) => row.expectation === 'cheap')?.locationName ?? null;
  const expectedSell = rows.find((row) => row.expectation === 'expensive')?.locationName ?? null;
  return `
    <div class="port-system-summary" data-system-resource-summary="${resourceId}" ${resourceId === initial ? '' : 'hidden'}>
      ${systemPriceSummary('GÜNSTIGSTER BEKANNTER EINKAUF', buy, model.locationId, 'buy', expectedBuy)}
      ${systemPriceSummary('BESTER BEKANNTER VERKAUF', sell, model.locationId, 'sell', expectedSell)}
      ${systemMarginSummary(buy, sell)}
    </div>
  `;
}

function systemMarketPrice(row: SystemMarketRow): string {
  const expectation = marketExpectation(row.expectation);
  if (row.sellPrice === null || row.ageDays === null) {
    return `<strong>KEINE MARKTDATEN</strong><small class="port-expectation port-expectation--${row.expectation}">ERWARTUNG: ${expectation}</small>`;
  }
  const age = row.ageDays === 0 ? 'LIVE' : row.ageDays + ' T ALT';
  return `<strong>${row.sellPrice.toLocaleString('de-DE')} CR/t</strong><small class="port-intel port-intel--${row.intelStatus}">${age} · ${row.stock ?? 0} t</small><small class="port-expectation port-expectation--${row.expectation}">PROFIL: ${expectation}</small>`;
}

function systemMarketProfit(row: SystemMarketRow): string {
  if (row.profit === null) return '<span>—</span><small>keine belastbaren Preisdaten</small>';
  const tone = row.profit >= 0 ? 'port-positive' : 'port-negative';
  return `<strong class="${tone}">${credits(row.profit)}</strong><small>aktuelle Fracht</small>`;
}

function systemMarketRoute(row: SystemMarketRow, currentLocationId: string): string {
  return row.locationId === currentLocationId
    ? '<b>HIER</b>'
    : `<button type="button" data-market-route="${row.locationId}">ROUTE SETZEN</button>`;
}

function systemMarketRow(row: SystemMarketRow, currentLocationId: string, initial: string): string {
  return `
    <div class="port-system-row" data-system-resource-row="${row.resourceId}" ${row.resourceId === initial ? '' : 'hidden'}>
      <div><strong>${row.locationName}</strong><small>${row.locationKind}${row.locationId === currentLocationId ? ' · HIER' : ''}</small></div>
      <div class="port-system-price">${systemMarketPrice(row)}</div>
      <div><span>${Math.round(row.distance).toLocaleString('de-DE')}</span><small>Distanz</small></div>
      <div>${systemMarketProfit(row)}</div>
      <div>${systemMarketRoute(row, currentLocationId)}</div>
    </div>
  `;
}

function systemMarket(model: PortViewModel): string {
  const owned = model.cargoSales[0]?.resourceId;
  const initial =
    owned && model.systemMarketResourceIds.includes(owned)
      ? owned
      : (model.systemMarketResourceIds[0] ?? '');
  const options = model.systemMarketResourceIds
    .map((id) => {
      const name = model.systemMarket.find((row) => row.resourceId === id)?.resourceName ?? id;
      return `<option value="${id}" ${id === initial ? 'selected' : ''}>${name}</option>`;
    })
    .join('');
  const summaries = model.systemMarketResourceIds
    .map((resourceId) => systemResourceSummary(model, resourceId, initial))
    .join('');
  const rows = model.systemMarket
    .map((row) => systemMarketRow(row, model.locationId, initial))
    .join('');

  return `
    <section class="port-trade-view" data-trade-section="system" hidden>
      <div class="port-panel-heading">
        <span>SYSTEMMARKT</span>
        <label>WARE <select data-system-resource-select>${options}</select></label>
      </div>
      ${summaries}
      <div class="port-system-head"><span>MARKT</span><span>VERKAUF / INTEL</span><span>DISTANZ</span><span>P/L FRACHT</span><span>ROUTE</span></div>
      <div class="port-system-list">${rows}</div>
      <div class="port-intel-hint">ⓘ PRODUZIERT/BENÖTIGT liefert nur eine strukturelle Erwartung. Konkrete Preise erscheinen ausschließlich durch Sensorintel oder Besuch und zeigen immer ihr Datenalter direkt am Preis.</div>
    </section>
  `;
}

function tradePane(model: PortViewModel): string {
  return `
    <section class="port-pane port-pane--trade" data-port-pane="trade">
      <div class="port-wide-panel port-trade-console">
        <nav class="port-trade-tabs" aria-label="Handelsansicht">
          <button type="button" class="is-active" data-trade-view="cargo">FRACHT</button>
          <button type="button" data-trade-view="market">MARKT</button>
          <button type="button" data-trade-view="system">SYSTEMMARKT</button>
        </nav>
        <section class="port-trade-view" data-trade-section="cargo">
          <div class="port-panel-heading"><span>MEINE FRACHT</span><small>WO VERKAUFE ICH MEINE LADUNG?</small></div>
          <div class="port-cargo-head"><span>WARE</span><span>HIER</span><span>BESTER BEKANNTER MARKT</span><span>AKTION</span></div>
          <div class="port-cargo-sale-list">${cargoSaleRows(model)}</div>
        </section>
        <section class="port-trade-view" data-trade-section="market" hidden>
          <div class="port-panel-heading"><span>LOKALER MARKT</span><small>WAS KAUFE ODER VERKAUFE ICH HIER?</small></div>
          <div class="port-price-legend" aria-label="Preisbewertung">
            <span class="port-price-band port-price-band--very-cheap">SEHR BILLIG</span>
            <span class="port-price-band port-price-band--cheap">BILLIG</span>
            <span class="port-price-band port-price-band--normal">NORMAL</span>
            <span class="port-price-band port-price-band--expensive">TEUER</span>
            <span class="port-price-band port-price-band--very-expensive">SEHR TEUER</span>
          </div>
          <div class="port-market-head">
            <span>WARE</span><span>PREIS</span><span>BESTAND</span><span>BEDARF</span>
            <span>PRODUKTION</span><span>KAUFEN</span><span>VERKAUFEN</span>
          </div>
          <div class="port-market-list">${marketRows(model)}</div>
        </section>
        ${systemMarket(model)}
      </div>
      <aside class="port-location-panel">
        <div class="port-location-hero">
          <div class="port-location-orbit"></div>
          <canvas class="port-location-canvas" aria-label="${model.locationName}"></canvas>
          <div class="port-location-copy"><span>${model.locationKind}</span><strong>${model.locationName}</strong><small>${model.subtitle}</small></div>
        </div>
        <div class="port-location-facts">
          <div><span>BEVÖLKERUNG</span><strong>${model.population}</strong></div>
          <div><span>WIRTSCHAFT</span><strong>${model.economy}</strong></div>
          <div><span>SICHERHEIT</span><strong>${model.security}</strong></div>
        </div>
        <div class="port-flow-grid">
          <div><span class="port-flow-title port-flow-title--good">PRODUZIERT</span>${model.producedNames.map((name) => `<b>${name}</b>`).join('')}</div>
          <div><span class="port-flow-title port-flow-title--need">BENÖTIGT</span>${model.neededNames.map((name) => `<b>${name}</b>`).join('')}</div>
        </div>
        <div class="port-route-card"><span>MARKTINTEL</span><strong>LIVE ODER VERALTET</strong><p>Der lokale Markt ist live. Im Systemmarkt siehst du das Alter jeder entfernten Preisinformation direkt am Preis.</p></div>
      </aside>
    </section>
  `;
}

function shellMarkup(model: PortViewModel): string {
  return `
    <header class="port-header">
      <div class="port-brand"><span>PROJECT SOJOURN</span><small>DOCKED OPERATIONS</small></div>
      <div class="port-title"><span>${model.locationKind}</span><strong>${model.locationName}</strong><small>${model.subtitle}</small></div>
      <div class="port-summary"><div><span>CREDITS</span><strong>${model.player.credits.toLocaleString('de-DE')}</strong></div><div><span>FRACHT</span><strong>${model.player.cargoUsed} / ${model.player.cargoCapacity} t</strong></div><div><span>SCHIFF</span><strong>${model.ship.name}</strong></div></div>
      <button class="port-return-button" type="button">ZUR STERNKARTE</button>
    </header>
    <nav class="port-tabs">
      ${model.tabs.map((tab) => `<button type="button" data-port-tab="${tab.id}" ${tab.enabled ? '' : 'disabled'}>${tab.label}${tab.id === 'shipyard' && !tab.enabled ? ' // NICHT VERFÜGBAR' : ''}</button>`).join('')}
    </nav>
    <main class="port-content">
      ${tradePane(model)}
      ${shipPane(model)}
      ${crewPane(model)}
      ${equipmentPane()}
      ${model.shipyardAvailable ? shipyardPane(model) : ''}
    </main>
    <footer class="port-footer"><span>${model.description}</span><strong>HANDELN · SCHIFF · CREW</strong></footer>
  `;
}

function bindSystemMarketFilter(shell: HTMLElement): void {
  const select = shell.querySelector<HTMLSelectElement>('[data-system-resource-select]');
  if (!select) return;
  const update = (): void => {
    for (const row of shell.querySelectorAll<HTMLElement>('[data-system-resource-row]')) {
      row.hidden = row.dataset.systemResourceRow !== select.value;
    }
    for (const summary of shell.querySelectorAll<HTMLElement>('[data-system-resource-summary]')) {
      summary.hidden = summary.dataset.systemResourceSummary !== select.value;
    }
  };
  select.addEventListener('change', update);
  update();
}

function bindTradeViews(shell: HTMLElement): void {
  const buttons = [...shell.querySelectorAll<HTMLButtonElement>('[data-trade-view]')];
  const sections = [...shell.querySelectorAll<HTMLElement>('[data-trade-section]')];
  const activate = (view: string): void => {
    for (const button of buttons)
      button.classList.toggle('is-active', button.dataset.tradeView === view);
    for (const section of sections) section.hidden = section.dataset.tradeSection !== view;
  };
  for (const button of buttons) {
    button.addEventListener('click', () => activate(button.dataset.tradeView ?? 'cargo'));
  }
  activate('cargo');
}

export function createPortPanel(options: PortPanelOptions): PortPanel {
  const shell = document.createElement('section');
  shell.className = 'port-shell';
  shell.innerHTML = shellMarkup(options.model);
  options.root.replaceChildren(shell);

  const tabs = [...shell.querySelectorAll<HTMLButtonElement>('[data-port-tab]')];
  const panes = [...shell.querySelectorAll<HTMLElement>('[data-port-pane]')];
  const returnButton = shell.querySelector<HTMLButtonElement>('.port-return-button');
  const locationCanvas = shell.querySelector<HTMLCanvasElement>('.port-location-canvas');
  if (!returnButton || !locationCanvas) throw new Error('Port UI controls are incomplete.');

  const locationRenderer = new PortLocationRenderer(locationCanvas, options.model.locationVisual);
  const locationObserver = new ResizeObserver(() => locationRenderer.resize());
  locationObserver.observe(locationCanvas);

  const activate = (tab: PortTab): void => {
    for (const button of tabs) button.classList.toggle('is-active', button.dataset.portTab === tab);
    for (const pane of panes) pane.hidden = pane.dataset.portPane !== tab;
  };

  for (const button of tabs) {
    button.addEventListener('click', () => {
      if (!button.disabled) {
        lastPortTab = button.dataset.portTab as PortTab;
        activate(lastPortTab);
      }
    });
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-buy-id]')) {
    button.addEventListener('click', () => options.onBuy(button.dataset.buyId ?? ''));
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-sell-id]')) {
    button.addEventListener('click', () => options.onSell(button.dataset.sellId ?? ''));
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-sell-all-id]')) {
    button.addEventListener('click', () => options.onSellAll(button.dataset.sellAllId ?? ''));
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-market-route]')) {
    button.addEventListener('click', () => options.onMarketRoute(button.dataset.marketRoute ?? ''));
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-component-type]')) {
    button.addEventListener('click', () => {
      const type = button.dataset.componentType as ShipComponentType;
      const index = Number(button.dataset.componentIndex ?? 0);
      const key = button.dataset.componentKey;
      const select = [
        ...shell.querySelectorAll<HTMLSelectElement>('[data-component-slot-select]'),
      ].find((item) => item.dataset.componentSlotSelect === key);
      options.onSetComponentSlot(type, index, select?.value || null);
    });
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-sell-loose-component]')) {
    button.addEventListener('click', () =>
      options.onSellLooseComponent(button.dataset.sellLooseComponent ?? '')
    );
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-buy-yard-id]')) {
    button.addEventListener('click', () =>
      options.onBuyShipyardVariant(
        button.dataset.buyYardType as ShipComponentType,
        button.dataset.buyYardId ?? ''
      )
    );
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-buy-catalog]')) {
    button.addEventListener('click', () => {
      const offer = shell.querySelector<HTMLSelectElement>('[data-yard-catalog]')?.value;
      if (!offer) return;
      const separator = offer.indexOf('|');
      if (separator < 1) return;
      options.onBuyShipyardVariant(
        offer.slice(0, separator) as ShipComponentType,
        offer.slice(separator + 1)
      );
    });
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-buy-ship-id]')) {
    button.addEventListener('click', () => options.onBuyShip(button.dataset.buyShipId ?? ''));
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-hire-crew-id]')) {
    button.addEventListener('click', () => options.onHireCrew(button.dataset.hireCrewId ?? ''));
  }
  for (const select of shell.querySelectorAll<HTMLSelectElement>('[data-station-id]')) {
    select.addEventListener('change', () =>
      options.onAssignCrew(select.dataset.stationId ?? '', select.value || null)
    );
  }

  bindSystemMarketFilter(shell);
  bindTradeViews(shell);
  bindShipyardBrowser(shell);
  returnButton.addEventListener('click', options.onReturnToStarMap);
  const lastButton = tabs.find((button) => button.dataset.portTab === lastPortTab);
  if (!lastButton || lastButton.disabled) lastPortTab = 'trade';
  activate(lastPortTab);

  return {
    destroy(): void {
      locationObserver.disconnect();
      shell.remove();
    },
  };
}
