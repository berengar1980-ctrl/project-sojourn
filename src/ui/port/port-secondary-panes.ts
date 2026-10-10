import type { PortViewModel } from '../../features/port/port-view-model';

export function shipPane(model: PortViewModel): string {
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
        <div class="port-panel-heading"><span>KOMPONENTEN</span><small>EINBAU / AUSTAUSCH</small></div>
        <div class="port-component-list">
          ${model.ship.components
            .map(
              (slot) => `
                <article class="port-component-slot ${slot.weaponSlot ? 'port-component-slot--weapon' : ''}">
                  <div><span>${slot.typeLabel.toUpperCase()}</span><strong>${slot.name}</strong>${slot.mountInfo ? `<small>${slot.mountInfo}</small>` : ''}</div>
                  <b>${slot.tier ? 'MK ' + ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][slot.tier] : 'LEER'}</b>
                  <small>${slot.power > 0 ? slot.power + ' ENERGIE' : 'PASSIV'}</small>
                  <select data-component-slot-select="${slot.key}">
                    <option value="">${slot.componentId ? 'AUSBAUEN' : 'LEER'}</option>
                    ${model.shipyard.loose
                      .filter(
                        (part) =>
                          part.type === slot.type &&
                          (!slot.weaponSlot ||
                            ((!slot.allowedMounts ||
                              (part.weaponMount && slot.allowedMounts.includes(part.weaponMount))) &&
                              (!slot.allowedFamilies ||
                                (part.weaponFamily && slot.allowedFamilies.includes(part.weaponFamily)))))
                      )
                      .map(
                        (part) =>
                          `<option value="${part.uid}">${part.name} · MK ${part.tier}</option>`
                      )
                      .join('')}
                  </select>
                  <button type="button" data-component-type="${slot.type}" data-component-index="${slot.index}" data-component-key="${slot.key}">ANWENDEN</button>
                </article>
              `
            )
            .join('')}
        </div>
        <div class="port-info-box">Nur im Inventar vorhandene Komponenten können eingebaut werden. Pro gekaufter Komponente ist genau ein Bonus aktiv.</div>
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
          <div class="port-crew-identity"><strong>${crew.name}${crew.elite ? ' // ELITE' : ''}</strong><span>${crew.role}</span><small class="port-crew-skills">${crew.skills.join(' · ')}</small></div>
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

export function crewPane(model: PortViewModel): string {
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

export function equipmentPane(): string {
  return `
    <section class="port-pane" data-port-pane="equipment" hidden>
      <div class="port-wide-panel">
        <div class="port-panel-heading"><span>PERSÖNLICHE AUSRÜSTUNG</span><small>CREW / BOARDING</small></div>
        <div class="port-info-box port-info-box--large">Die Crew-Ausrüstungsdaten sind bereits echt. Der Händler wird als eigener Schritt an Inventar und Crew-Slots angeschlossen; hier werden keine Fake-Käufe mehr angezeigt.</div>
      </div>
    </section>
  `;
}

const SHIP_ROLE_NAMES: Readonly<Record<string, string>> = {
  patrol: 'PATROUILLE',
  mining: 'MINING',
  salvage: 'BERGUNG',
  freighter: 'FRACHTER',
};

function shipyardShipOffers(model: PortViewModel): string {
  return model.shipyard.ships
    .map(
      (offer) => `
        <article class="port-yard-ship" data-yard-ship="${offer.id}" data-yard-role="${offer.role}" hidden>
          <div class="port-yard-preview">
            <img src="${offer.spriteUrl}" alt="${offer.name}" loading="lazy">
            <div class="port-yard-preview-label"><span>${SHIP_ROLE_NAMES[offer.role] ?? offer.role.toUpperCase()}</span><strong>${offer.name}</strong><small>${offer.lengthMeters} METER · MK I–${['', 'I', 'II', 'III', 'IV', 'V', 'VI'][offer.maxComponentTier] ?? offer.maxComponentTier}</small></div>
          </div>
          <div class="port-yard-specifications">
            <div><span>HÜLLE</span><strong>${offer.hullMaxHp}</strong></div>
            <div><span>SCHILD</span><strong>${offer.shieldMaxHp}</strong></div>
            <div><span>REISEGESCHWINDIGKEIT</span><strong>${offer.speed}</strong></div>
            <div><span>FRACHTRAUM</span><strong>${offer.cargoCapacityTons} t</strong></div>
            <div><span>WAFFENSLOTS</span><strong>${offer.weaponSlots}</strong></div>
            <div><span>CREW-KOJEN</span><strong>${offer.crewBerths}</strong></div>
          </div>
          <div class="port-yard-buy-footer">
            <div><small>${offer.owned ? 'BEREITS IN BESITZ' : 'KAUFPREIS'}</small><strong>${offer.owned ? 'EIGENES SCHIFF' : offer.price.toLocaleString('de-DE') + ' CR'}</strong></div>
            <button type="button" data-buy-ship-id="${offer.id}" ${!offer.owned && model.player.credits < offer.price ? 'disabled' : ''}>${offer.owned ? 'SCHIFF AUSWÄHLEN' : 'SCHIFF KAUFEN'}</button>
          </div>
        </article>
      `
    )
    .join('');
}

export function shipyardPane(model: PortViewModel): string {
  const loose =
    model.shipyard.loose.length === 0
      ? '<div class="port-info-box">Keine losen Schiffskomponenten an Bord.</div>'
      : model.shipyard.loose
          .map(
            (item) => `
              <div class="port-shipyard-row">
                <div><strong>${item.name}</strong><small>${item.type.toUpperCase()} · MK ${item.tier} · ${item.cargoTons} t${item.modifierLabel ? ' · ' + item.modifierLabel : ''}</small></div>
                <span>${item.special ? 'BERGUNGSFUND' : 'KOMPONENTE'}</span>
                <button type="button" data-sell-loose-component="${item.uid}">VERKAUFEN${item.special ? ' & ANALYSIEREN' : ''} · ${item.sellValue.toLocaleString('de-DE')} CR</button>
              </div>
            `
          )
          .join('');
  const variants =
    model.shipyard.variants.length === 0
      ? '<div class="port-info-box">Noch keine Bergungstechnologie analysiert.</div>'
      : model.shipyard.variants
          .map(
            (item) => `
              <div class="port-shipyard-row">
                <div><strong>${item.name}</strong><small>${item.type.toUpperCase()} · MK ${item.tier} · ${item.modifierLabel}</small></div>
                <span>WERFTSTANDARD</span>
                <button type="button" data-buy-yard-type="${item.type}" data-buy-yard-id="${item.id}" ${model.player.credits >= item.cost ? '' : 'disabled'}>KAUFEN · ${item.cost.toLocaleString('de-DE')} CR</button>
              </div>
            `
          )
          .join('');
  return `
    <section class="port-pane" data-port-pane="shipyard" hidden>
      <div class="port-wide-panel">
        <div class="port-panel-heading"><span>WERFT</span><small>SCHIFFSKAUF / KOMPONENTEN</small></div>
        <nav class="port-yard-tabs" aria-label="Werftbereiche">
          <button type="button" class="is-active" data-yard-view="ships">SCHIFFSKAUF</button>
          <button type="button" data-yard-view="components">KOMPONENTEN & UPGRADES</button>
        </nav>
        <div class="port-yard-section" data-yard-section="ships">
          <div class="port-panel-heading"><span>SCHIFFSKATALOG</span><small>RUMPF / TECHNISCHE DATEN / KAUF</small></div>
          <div class="port-yard-browse">
            <label>SCHIFFSTYP
              <select data-yard-role-select>
                <option value="patrol">PATROUILLE</option>
                <option value="mining">MINING</option>
                <option value="salvage">BERGUNG</option>
                <option value="freighter">FRACHTER</option>
              </select>
            </label>
            <label>MODELL
              <select data-yard-ship-select></select>
            </label>
            <span data-yard-ship-count></span>
          </div>
          <div class="port-yard-ship-stage">${shipyardShipOffers(model)}</div>
        </div>
        <div class="port-yard-section" data-yard-section="components" hidden>
        <div class="port-panel-heading"><span>KOMPONENTENMARKT MK I–VI</span><small>GENAU EIN BONUS</small></div>
        <div class="port-shipyard-row">
          <select data-yard-catalog>
            ${model.shipyard.catalog
              .map(
                (offer) => `
              <option value="${offer.type}|${offer.id}" ${model.player.credits < offer.cost ? 'disabled' : ''}>${offer.name} · ${offer.modifierLabel} · ${offer.cost.toLocaleString('de-DE')} CR</option>
            `
              )
              .join('')}
          </select>
          <button type="button" data-buy-catalog>GEWÄHLTE KOMPONENTE KAUFEN</button>
        </div>
        <div class="port-panel-heading"><span>GEBORGENE KOMPONENTEN</span><small>VERKAUF / ANALYSE</small></div>
        <div class="port-shipyard-list">${loose}</div>
        <div class="port-panel-heading"><span>FREIGESCHALTETE WERFTVARIANTEN</span><small>GEMEINSAMER FORSCHUNGSSTAND</small></div>
        <div class="port-shipyard-list">${variants}</div>
        </div>
      </div>
    </section>
  `;
}
