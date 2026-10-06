import type { PortTab } from '../../core/port-types';
import type { ShipComponentType } from '../../core/ship-types';
import type { PortViewModel } from '../../features/port/port-view-model';
import { PortLocationRenderer } from './port-location-renderer';

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
}

function credits(value: number): string {
  const sign = value > 0 ? '+' : '';
  return sign + Math.round(value).toLocaleString('de-DE') + ' CR';
}

function marketRows(model: PortViewModel): string {
  return model.market
    .map(
      (row) => `
        <div class="port-market-row" data-market-id="${row.id}">
          <span class="port-market-name">${row.name}<small class="port-legality port-legality--${row.legality}">${row.legalityLabel}</small><small class="port-owned">FRACHT ${row.owned}</small></span>
          <strong>${row.buyPrice.toLocaleString('de-DE')} CR</strong>
          <span>${row.stock.toLocaleString('de-DE')}</span>
          <span class="port-demand port-demand--${row.demandLabel.replace(' ', '-')}">${row.demandLabel}</span>
          <span>${row.productionLabel}</span>
          <span class="port-trend port-trend--${row.trend}">${row.trend === 'up' ? '▲' : row.trend === 'down' ? '▼' : '—'} ${Math.abs(row.pressurePercent)}%</span>
          <button class="port-buy" type="button" data-buy-id="${row.id}">+1</button>
          <button class="port-sell" type="button" data-sell-id="${row.id}" ${row.owned > 0 ? '' : 'disabled'}>-1</button>
        </div>
      `
    )
    .join('');
}

function cargoSaleRows(model: PortViewModel): string {
  if (model.cargoSales.length === 0) {
    return '<div class="port-info-box">Frachtraum leer. Kaufe, mine oder berge Waren, um Verkaufschancen zu vergleichen.</div>';
  }
  return model.cargoSales
    .map((cargo) => {
      const bestLine = cargo.bestIsHere
        ? '<b>Hier ist der beste bekannte Markt.</b>'
        : `Bester bekannter Markt: <b>${cargo.bestLocationName}</b> · ${credits(cargo.bestProfit)} · Daten ${cargo.bestAgeDays === 0 ? 'LIVE' : cargo.bestAgeDays + ' T alt'}`;
      return `
        <article class="port-cargo-sale port-cargo-sale--${cargo.rating}">
          <div class="port-cargo-sale-main">
            <span>FRACHT</span>
            <strong>${cargo.name}</strong>
            <small>${cargo.quantity} t · Ø Einkauf ${Math.round(cargo.averageCost).toLocaleString('de-DE')} CR/t</small>
          </div>
          <div><span>HIER VERKAUFEN</span><strong>${cargo.localSellPrice.toLocaleString('de-DE')} CR/t</strong><small class="${cargo.localProfit >= 0 ? 'port-positive' : 'port-negative'}">${credits(cargo.localProfit)}</small></div>
          <div class="port-cargo-sale-best"><span>SYSTEMVERGLEICH</span>${bestLine}</div>
          <div class="port-cargo-sale-actions">
            <button type="button" data-sell-id="${cargo.resourceId}">1 t VERKAUFEN</button>
            <button type="button" data-sell-all-id="${cargo.resourceId}">ALLES VERKAUFEN</button>
            ${cargo.bestIsHere ? '' : `<button type="button" data-market-route="${cargo.bestLocationId}">ROUTE SETZEN</button>`}
          </div>
        </article>
      `;
    })
    .join('');
}

function tradeOpportunityRows(model: PortViewModel): string {
  if (model.tradeOpportunities.length === 0) {
    return '<div class="port-info-box">Noch keine belastbare Handelsroute bekannt.</div>';
  }
  return model.tradeOpportunities
    .slice(0, 12)
    .map(
      (route) => `
        <article class="port-trade-opportunity ${route.spreadPerTon > 0 ? 'port-trade-opportunity--profit' : 'port-trade-opportunity--weak'}">
          <div class="port-trade-opportunity-resource">
            <span>WARE</span>
            <strong>${route.resourceName}</strong>
            <small>${route.spreadPerTon >= 0 ? '+' : ''}${route.spreadPerTon.toLocaleString('de-DE')} CR/t · ${route.spreadPercent >= 0 ? '+' : ''}${route.spreadPercent}%</small>
          </div>
          <div class="port-trade-opportunity-leg">
            <span>GÜNSTIG KAUFEN</span>
            <strong>${route.buyLocationName}</strong>
            <b>${route.buyPrice.toLocaleString('de-DE')} CR/t</b>
            <small>${route.buyAgeDays === 0 ? 'LIVE' : 'Daten vor ' + route.buyAgeDays + ' T'} · ${Math.round(route.buyDistance).toLocaleString('de-DE')} Dist.</small>
            <button type="button" data-market-route="${route.buyLocationId}">KURS ZUM KAUF</button>
          </div>
          <div class="port-trade-opportunity-arrow">→</div>
          <div class="port-trade-opportunity-leg">
            <span>TEUER VERKAUFEN</span>
            <strong>${route.sellLocationName}</strong>
            <b>${route.sellPrice.toLocaleString('de-DE')} CR/t</b>
            <small>${route.sellAgeDays === 0 ? 'LIVE' : 'Daten vor ' + route.sellAgeDays + ' T'} · ${Math.round(route.sellDistance).toLocaleString('de-DE')} Dist.</small>
            <button type="button" data-market-route="${route.sellLocationId}">KURS ZUM VERKAUF</button>
          </div>
        </article>
      `
    )
    .join('');
}

function tradeOpportunities(model: PortViewModel): string {
  return `
    <section class="port-trade-routes">
      <div class="port-panel-heading">
        <span>HANDELSROUTEN</span>
        <small>BILLIGSTER BEKANNTER KAUF → HÖCHSTER BEKANNTER VERKAUF</small>
      </div>
      <div class="port-system-note">Nach geschätzter Marge sortiert. Das Datenalter steht direkt an beiden Enden der Route – alte Preise sind Chancen, aber keine Garantie.</div>
      <div class="port-trade-opportunity-list">${tradeOpportunityRows(model)}</div>
    </section>
  `;
}

function systemMarket(model: PortViewModel): string {
  const owned = model.cargoSales[0]?.resourceId;
  const initial = owned ?? model.systemMarketResourceIds[0] ?? '';
  const options = model.systemMarketResourceIds
    .map((id) => {
      const name = model.systemMarket.find((row) => row.resourceId === id)?.resourceName ?? id;
      return `<option value="${id}" ${id === initial ? 'selected' : ''}>${name}</option>`;
    })
    .join('');
  const rows = model.systemMarket
    .map(
      (row) => `
        <div class="port-system-row" data-system-resource-row="${row.resourceId}" ${row.resourceId === initial ? '' : 'hidden'}>
          <div><strong>${row.locationName}</strong><small>${row.locationKind}${row.locationId === model.locationId ? ' · HIER' : ''}</small></div>
          <div class="port-system-price"><strong>${row.sellPrice.toLocaleString('de-DE')} CR/t</strong><small class="port-intel port-intel--${row.intelStatus}">${row.ageDays === 0 ? 'LIVE' : 'vor ' + row.ageDays + ' T'} · ${row.stock} t gemeldet</small></div>
          <div><span>${Math.round(row.distance).toLocaleString('de-DE')}</span><small>Distanz</small></div>
          <div>${row.profit === null ? '<span>—</span><small>keine Fracht</small>' : `<strong class="${row.profit >= 0 ? 'port-positive' : 'port-negative'}">${credits(row.profit)}</strong><small>für aktuelle Fracht</small>`}</div>
          <div>${row.locationId === model.locationId ? '<b>AKTUELL</b>' : `<button type="button" data-market-route="${row.locationId}">DORTHIN FLIEGEN</button>`}</div>
        </div>
      `
    )
    .join('');

  return `
    <section class="port-system-market">
      <div class="port-panel-heading">
        <span>SYSTEMMARKT</span>
        <label>WARE <select data-system-resource-select>${options}</select></label>
      </div>
      <div class="port-system-note">Systemweite Marktdaten sind grundsätzlich bekannt. Sie werden aber nur beim Besuch eines Marktes aktualisiert und altern danach weiter. Gelbe/rote Daten können inzwischen deutlich abweichen.</div>
      <div class="port-system-head"><span>MARKT</span><span>VERKAUFSPREIS / DATENALTER</span><span>DISTANZ</span><span>ERWARTETER P/L</span><span>ROUTE</span></div>
      <div class="port-system-list">${rows}</div>
    </section>
  `;
}

function tradePane(model: PortViewModel): string {
  return `
    <section class="port-pane port-pane--trade" data-port-pane="trade">
      <div class="port-wide-panel port-trade-stack">
        ${tradeOpportunities(model)}
        <div class="port-panel-heading"><span>FRACHT VERKAUFEN</span><small>LOKALER PREIS VS. BEKANNTE SYSTEMMÄRKTE</small></div>
        <div class="port-cargo-sale-list">${cargoSaleRows(model)}</div>
        ${systemMarket(model)}
        <section class="port-local-market">
          <div class="port-panel-heading"><span>LOKALER MARKT</span><small>DYNAMISCHE PREISE</small></div>
          <div class="port-market-head">
            <span>WARE</span><span>PREIS</span><span>BESTAND</span><span>BEDARF</span>
            <span>PRODUKTION</span><span>TREND</span><span>KAUFEN</span><span>VERKAUFEN</span>
          </div>
          <div class="port-market-list">${marketRows(model)}</div>
        </section>
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
        <div class="port-route-card"><span>MARKTINFORMATION</span><strong>Preiswissen verfällt</strong><p>Der Markt an diesem Dock ist live. Andere Orte zeigen den letzten bekannten Stand und dessen Alter.</p></div>
      </aside>
    </section>
  `;
}

function shipPane(model: PortViewModel): string {
  return `
    <section class="port-pane port-pane--ship" data-port-pane="ship" hidden>
      <div class="port-ship-console">
        <div class="port-panel-heading"><span>SCHIFF // ${model.ship.name.toUpperCase()}</span><small>${model.ship.role.toUpperCase()} · ${model.ship.lengthMeters} m</small></div>
        <div class="port-ship-visual">
          <img src="${model.ship.spriteUrl}" alt="${model.ship.name}">
          <div class="port-ship-stats">
            <div><span>HÜLLE MAX</span><strong>${model.ship.hullMaxHp}</strong></div>
            <div><span>SCHILD MAX</span><strong>${model.ship.shieldMaxHp}</strong></div>
            <div><span>REAKTOR</span><strong>${model.ship.reactorOutput}</strong></div>
            <div><span>KAMPFLAST</span><strong>${model.ship.combatPowerUsed}</strong></div>
            <div><span>ENERGIERESERVE</span><strong class="${model.ship.combatPowerFree >= 0 ? 'port-positive' : 'port-negative'}">${model.ship.combatPowerFree}</strong></div>
          </div>
        </div>
      </div>
      <div class="port-ship-components">
        <div class="port-panel-heading"><span>KOMPONENTEN</span><small>STARTAUSSTATTUNG MK I</small></div>
        <div class="port-component-list">
          ${model.ship.components
            .map(
              (slot) => `
                <article class="port-component-slot ${slot.weaponSlot ? 'port-component-slot--weapon' : ''}">
                  <div><span>${slot.typeLabel.toUpperCase()}</span><strong>${slot.name}</strong></div>
                  <b>${slot.tier ? 'MK ' + ['','I','II','III','IV','V','VI'][slot.tier] : 'LEER'}</b>
                  <small>${slot.power > 0 ? slot.power + ' ENERGIE' : 'PASSIV'}</small>
                  ${
                    slot.weaponSlot
                      ? slot.componentId
                        ? `<button type="button" data-component-type="weapon" data-component-index="${slot.index}" data-component-id="">AUSBAUEN</button>`
                        : `<button type="button" data-component-type="weapon" data-component-index="${slot.index}" data-component-id="weapon1">LIGHT LASER MK I MONTIEREN</button>`
                      : '<span class="port-component-fixed">MONTIERT</span>'
                  }
                </article>
              `
            )
            .join('')}
        </div>
        <div class="port-info-box">Alle Schiffe starten vorerst vollständig mit Mk-I-Komponenten. Waffenhalterungen sind echte Slots und können bereits ein- und ausgebaut werden. Höhere Mk-Stufen und weitere Waffenfamilien kommen auf diesen Slot-Unterbau.</div>
      </div>
    </section>
  `;
}

function crewRows(model: PortViewModel): string {
  const full = model.crew.used >= model.crew.capacity;
  return model.crew.candidates
    .map(
      (crew) => `
        <article class="port-crew-row">
          <div class="port-crew-avatar">${crew.initials}</div>
          <div class="port-crew-identity"><strong>${crew.name}${crew.elite ? ' // ELITE' : ''}</strong><span>${crew.role}</span></div>
          <div class="port-traits">${crew.traits.map((trait) => `<span>${trait}</span>`).join('')}</div>
          <div class="port-combat"><span>FK ${crew.ranged}</span><span>NK ${crew.melee}</span></div>
          <div class="port-crew-equipment">${crew.equipment.join(' · ')}</div>
          <strong class="port-salary">ANTEIL ${crew.share}%</strong>
          <button class="port-action-button" type="button" data-hire-crew-id="${crew.id}" ${full ? 'disabled' : ''}>ANHEUERN</button>
        </article>
      `
    )
    .join('');
}

function crewPane(model: PortViewModel): string {
  return `
    <section class="port-pane" data-port-pane="crew" hidden>
      <div class="port-wide-panel">
        <div class="port-panel-heading"><span>VERFÜGBARE REKRUTEN</span><small>${model.crew.candidates.length} KANDIDATEN · ${model.crew.used} / ${model.crew.capacity} KOJEN</small></div>
        <div class="port-crew-list">${crewRows(model) || '<div class="port-info-box">Keine weiteren Spezialisten verfügbar.</div>'}</div>
      </div>
      <aside class="port-stations-panel">
        <div class="port-panel-heading"><span>SCHIFFSSTATIONEN</span><small>CREW ZUWEISEN</small></div>
        <div class="port-station-grid">
          ${model.crew.stations
            .map(
              (station) => `
                <label class="port-station-assignment">
                  <span>${station.label}<small>${station.skill.toUpperCase()}</small></span>
                  <select data-station-id="${station.id}">
                    <option value="">AUTOMATIK</option>
                    ${model.crew.hired
                      .map(
                        (crew) =>
                          `<option value="${crew.id}" ${station.assignedCrewId === crew.id ? 'selected' : ''}>${crew.name}</option>`
                      )
                      .join('')}
                  </select>
                </label>
              `
            )
            .join('')}
        </div>
      </aside>
    </section>
  `;
}

function equipmentPane(): string {
  return `
    <section class="port-pane" data-port-pane="equipment" hidden>
      <div class="port-wide-panel">
        <div class="port-panel-heading"><span>PERSÖNLICHE AUSRÜSTUNG</span><small>CREW / BOARDING</small></div>
        <div class="port-info-box port-info-box--large">Die Crew-Ausrüstungsdaten sind bereits echt. Der Händler wird als eigener Schritt an Inventar und Crew-Slots angeschlossen; hier werden keine Fake-Käufe mehr angezeigt.</div>
      </div>
    </section>
  `;
}

function shipyardPane(model: PortViewModel): string {
  return `
    <section class="port-pane" data-port-pane="shipyard" hidden>
      <div class="port-wide-panel">
        <div class="port-panel-heading"><span>WERFT</span><small>MK-I-STANDARD</small></div>
        <div class="port-ship-overview"><img src="${model.ship.spriteUrl}" alt=""><div><span>AKTIVER RUMPF</span><strong>${model.ship.name}</strong><small>Alle Standardkomponenten derzeit Mk I</small></div></div>
        <div class="port-info-box port-info-box--large">Die Werft zeigt keine erfundenen T2/T3-Upgrades mehr. Als Nächstes können hier echte Komponenten gekauft, eingelagert und in die bereits vorhandenen Schiffsslots montiert werden.</div>
      </div>
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
  };
  select.addEventListener('change', update);
  update();
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
      const id = button.dataset.componentId || null;
      options.onSetComponentSlot(type, index, id);
    });
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
