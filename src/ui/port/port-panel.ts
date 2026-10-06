import type { PortTab } from '../../core/port-types';
import type { PortViewModel } from '../../features/port/port-view-model';

export interface PortPanel {
  destroy(): void;
}

interface PortPanelOptions {
  readonly root: HTMLElement;
  readonly model: PortViewModel;
  readonly onReturnToStarMap: () => void;
  readonly onBuy: (resourceId: string) => void;
  readonly onSell: (resourceId: string) => void;
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

function crewRows(model: PortViewModel): string {
  return model.crew
    .map(
      (crew) => `
        <article class="port-crew-row">
          <div class="port-crew-avatar">${crew.initials}</div>
          <div class="port-crew-identity"><strong>${crew.name}</strong><span>${crew.role}</span></div>
          <div class="port-traits">${crew.traits.map((trait) => `<span>${trait}</span>`).join('')}</div>
          <div class="port-combat" aria-label="Kampfstärke ${crew.combat} von 5">
            ${Array.from({ length: 5 }, (_, index) => `<i class="${index < crew.combat ? 'is-active' : ''}"></i>`).join('')}
          </div>
          <div class="port-crew-equipment">${crew.equipment.join(' · ')}</div>
          <strong class="port-salary">${crew.salary.toLocaleString('de-DE')} CR</strong>
          <button class="port-action-button" type="button">ANHEUERN</button>
        </article>
      `
    )
    .join('');
}

function tradePane(model: PortViewModel): string {
  return `
    <section class="port-pane port-pane--trade" data-port-pane="trade">
      <div class="port-market-panel">
        <div class="port-panel-heading"><span>LOKALER MARKT</span><small>DYNAMISCHE PREISE</small></div>
        <div class="port-market-head">
          <span>WARE</span><span>PREIS</span><span>BESTAND</span><span>BEDARF</span>
          <span>PRODUKTION</span><span>TREND</span><span>KAUFEN</span><span>VERKAUFEN</span>
        </div>
        <div class="port-market-list">${marketRows(model)}</div>
        <div class="port-market-detail">
          <div><span>MARKTLOGIK</span><strong>Bedarf + Bestand + Produktion</strong></div>
          <p>Hoher Bedarf hebt den Preis. Hoher lokaler Bestand und starke Produktion drücken ihn wieder. Dadurch kann dieselbe Ware an zwei Orten völlig unterschiedlich bewertet werden.</p>
        </div>
      </div>
      <aside class="port-location-panel">
        <div class="port-location-hero">
          <div class="port-location-orbit"></div>
          <div class="port-location-body">${model.locationName.slice(0, 1)}</div>
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
        <div class="port-route-card"><span>HANDELSCHANCE</span><strong>Preisunterschiede ausnutzen</strong><p>Vergleiche Bestand und Bedarf mit anderen Häfen. Waren mit Knappheit sind gute Verkaufsziele.</p></div>
      </aside>
    </section>
  `;
}

function crewPane(model: PortViewModel): string {
  return `
    <section class="port-pane" data-port-pane="crew" hidden>
      <div class="port-wide-panel">
        <div class="port-panel-heading"><span>VERFÜGBARE REKRUTEN</span><small>${model.crew.length} KANDIDATEN</small></div>
        <div class="port-crew-list">${crewRows(model)}</div>
      </div>
      <aside class="port-stations-panel">
        <div class="port-panel-heading"><span>SCHIFFSSTATIONEN</span><small>CREW ZUWEISEN</small></div>
        <div class="port-station-grid">
          ${['Brücke', 'Sensorik', 'Maschinenraum', 'Waffen', 'Medizin', 'Fracht']
            .map(
              (station, index) =>
                `<button type="button"><span>${station}</span><strong>0 / ${index === 2 || index === 3 ? 2 : 1}</strong><i>＋</i></button>`
            )
            .join('')}
        </div>
        <div class="port-info-box">Crew-Skills wirken später direkt auf Sensorik, Navigation, Reaktor, Waffen und Boarding. Kampfwerte und Ausrüstung bleiben Teil derselben Figur.</div>
      </aside>
    </section>
  `;
}

function equipmentPane(): string {
  return `
    <section class="port-pane" data-port-pane="equipment" hidden>
      <div class="port-wide-panel">
        <div class="port-panel-heading"><span>AUSRÜSTUNG</span><small>STANDARDISIERTE PREISE</small></div>
        <div class="port-equipment-grid">
          ${[
            ['Autopistole', 'Seitenwaffe', '320 CR'],
            ['Karabiner', 'Fernkampf', '740 CR'],
            ['Panzerweste', 'Schutz', '680 CR'],
            ['Medkit', 'Medizin', '410 CR'],
            ['Werkzeugsatz', 'Technik', '520 CR'],
            ['Scanner', 'Sensorik', '860 CR'],
          ]
            .map(
              ([name, type, price]) =>
                `<article><div class="port-equipment-icon">▣</div><span>${type}</span><strong>${name}</strong><b>${price}</b><button type="button">KAUFEN</button></article>`
            )
            .join('')}
        </div>
      </div>
      <aside class="port-stations-panel">
        <div class="port-panel-heading"><span>ZWECK</span><small>KEINE HANDELSWARE</small></div>
        <div class="port-info-box port-info-box--large">Ausrüstung hat überall denselben Basispreis und ist nicht für Arbitrage gedacht. Sie verbessert Crew für spätere Enterkämpfe und Spezialaufgaben.</div>
      </aside>
    </section>
  `;
}

function shipyardPane(model: PortViewModel): string {
  return `
    <section class="port-pane" data-port-pane="shipyard" hidden>
      <div class="port-shipyard-main">
        <div class="port-panel-heading"><span>WERFT // KOMPONENTEN</span><small>NUR AN SCHIFFSWERFTEN</small></div>
        <div class="port-ship-overview">
          <img src="${model.ship.spriteUrl}" alt="">
          <div><span>AKTIVES SCHIFF</span><strong>${model.ship.name}</strong><small>${model.ship.role.toUpperCase()} · ${model.ship.lengthMeters} m</small></div>
        </div>
        <div class="port-component-grid">
          ${[
            ['Antrieb', 'T2', '92%'],
            ['Reaktor', 'T2', '88%'],
            ['Sensoren', 'T1', '76%'],
            ['Frachtraum', 'T3', '100%'],
            ['Schildgenerator', 'T2', '78%'],
            ['Waffenhalterung', 'T1', '64%'],
          ]
            .map(
              ([name, tier, condition]) =>
                `<button type="button"><span>${name}</span><strong>${tier}</strong><i>${condition}</i><b>UPGRADE ›</b></button>`
            )
            .join('')}
        </div>
      </div>
      <aside class="port-stations-panel">
        <div class="port-panel-heading"><span>SCHIFFSKAUF</span><small>VERFÜGBARE KLASSEN</small></div>
        <div class="port-ship-class-list">
          ${['Miner', 'Frachter', 'Berger', 'Patrouille'].map((name) => `<button type="button"><i>◆</i><span>${name}</span><strong>ANSEHEN ›</strong></button>`).join('')}
        </div>
      </aside>
    </section>
  `;
}

function shellMarkup(model: PortViewModel): string {
  return `
    <header class="port-header">
      <div class="port-brand"><span>PROJECT SOJOURN</span><small>DOCKED OPERATIONS</small></div>
      <div class="port-title"><span>${model.locationKind}</span><strong>${model.locationName}</strong><small>${model.subtitle}</small></div>
      <div class="port-summary"><div><span>CREDITS</span><strong>${model.player.credits.toLocaleString('de-DE')}</strong></div><div><span>FRACHT</span><strong>${model.player.cargoUsed} / ${model.player.cargoCapacity} t${model.player.specialCargoCapacity > 0 ? ' · HANDEL ' + model.player.generalCargoCapacity + ' t' : ''}</strong></div><div><span>SCHIFF</span><strong>${model.ship.name}</strong></div></div>
      <button class="port-return-button" type="button">ZUR STERNKARTE</button>
    </header>
    <nav class="port-tabs">
      ${model.tabs.map((tab) => `<button type="button" data-port-tab="${tab.id}" ${tab.enabled ? '' : 'disabled'}>${tab.label}${tab.id === 'shipyard' && !tab.enabled ? ' // NICHT VERFÜGBAR' : ''}</button>`).join('')}
    </nav>
    <main class="port-content">
      ${tradePane(model)}
      ${crewPane(model)}
      ${equipmentPane()}
      ${model.shipyardAvailable ? shipyardPane(model) : ''}
    </main>
    <footer class="port-footer"><span>${model.description}</span><strong>HANDELN · AUFRÜSTEN · CREW VERWALTEN</strong></footer>
  `;
}

export function createPortPanel(options: PortPanelOptions): PortPanel {
  const shell = document.createElement('section');
  shell.className = 'port-shell';
  shell.innerHTML = shellMarkup(options.model);
  options.root.replaceChildren(shell);

  const tabs = [...shell.querySelectorAll<HTMLButtonElement>('[data-port-tab]')];
  const panes = [...shell.querySelectorAll<HTMLElement>('[data-port-pane]')];
  const returnButton = shell.querySelector<HTMLButtonElement>('.port-return-button');
  if (!returnButton) throw new Error('Port UI return control is missing.');

  const activate = (tab: PortTab): void => {
    for (const button of tabs) button.classList.toggle('is-active', button.dataset.portTab === tab);
    for (const pane of panes) pane.hidden = pane.dataset.portPane !== tab;
  };

  for (const button of tabs) {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      activate(button.dataset.portTab as PortTab);
    });
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-buy-id]')) {
    button.addEventListener('click', () => options.onBuy(button.dataset.buyId ?? ''));
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-sell-id]')) {
    button.addEventListener('click', () => options.onSell(button.dataset.sellId ?? ''));
  }
  returnButton.addEventListener('click', options.onReturnToStarMap);
  activate('trade');

  return {
    destroy(): void {
      shell.remove();
    },
  };
}
