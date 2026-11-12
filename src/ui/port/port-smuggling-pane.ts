import type { SmugglingPortView } from './port-panel';

export function smugglingPane(view: SmugglingPortView): string {
  const intelAvailable = view.day >= view.intelDay;
  const known = view.known || view.installed;
  const factionLabel = view.protectionFaction
    ? 'Schutzbrief von ' + view.protectionFaction
    : 'Kein Schutzbrief';
  return `
    <section class="port-pane" data-port-pane="smuggling" hidden>
      <div class="port-wide-panel">
        <div class="port-panel-heading">
          <span>UNTERWELT · SCHMUGGEL</span><small>VERDACHT ${Math.round(view.suspicion)} / 100</small>
        </div>
        <div class="port-info-box">
          <strong>UNTERWELT-KONTAKT</strong>
          <p>${
            known
              ? 'Der Kontakt zur Unterwelt-Werft ist bekannt.'
              : intelAvailable
                ? 'Ein Informant kann den geheimen Umbau freischalten.'
                : 'Der Informant erscheint ab Wirtschaftstag ' + view.intelDay + '.'
          }</p>
          ${
            !known
              ? `<button type="button" data-buy-hold-intel ${intelAvailable ? '' : 'disabled'}>
                KONTAKT BEZAHLEN · ${view.intelPrice.toLocaleString('de-DE')} CR
              </button>`
              : ''
          }
        </div>
        ${
          known
            ? `<div class="port-info-box">
              <strong>VERDECKTER FRACHTRAUM · UNTERWELT-WERFT</strong>
              <p>${
                view.installed
                  ? `INSTALLIERT · ${view.hiddenUsed} / ${view.hiddenCapacity} t verdeckt · Normalfracht -${view.normalPenalty} t · Verschleierung ${Math.round(view.concealment * 100)} %`
                  : `24 t verdeckte Kapazität · Normalfracht -12 t · ${view.price.toLocaleString('de-DE')} CR. Nur an Piratenstützpunkten erhältlich.`
              }</p>
              ${
                view.atPirateBase && !view.installed
                  ? '<button type="button" data-install-hidden-hold>VERDECKTEN FRACHTRAUM EINBAUEN</button>'
                  : ''
              }
              ${view.hiddenRows
                .map(
                  (lot) => `
                <div style="margin:8px 0">
                  <strong>${lot.name}</strong> · sichtbar ${lot.visible} t · verdeckt ${lot.hidden} t
                  <button type="button" data-hide-cargo="${lot.id}"
                    ${!view.installed || lot.visible <= 0 || view.hiddenUsed >= view.hiddenCapacity ? 'disabled' : ''}>
                    1 t VERSTECKEN
                  </button>
                  <button type="button" data-unhide-cargo="${lot.id}" ${lot.hidden <= 0 ? 'disabled' : ''}>
                    1 t AUSLADEN
                  </button>
                </div>
              `
                )
                .join('')}
            </div>`
            : ''
        }
        <div class="port-info-box">
          <strong>KORSAREN-SCHUTZBRIEF</strong>
          <p>${factionLabel} · 5 % Abgabe auf Verkäufe illegaler Waren.
             Schützt vor Überfällen der jeweiligen Korsarenfraktion.</p>
          ${
            view.atPirateBase && view.pirateFaction !== view.protectionFaction
              ? '<button type="button" data-pirate-protection>SCHUTZBRIEF DER LOKALEN FRAKTION ANNEHMEN</button>'
              : ''
          }
        </div>
        <div class="port-info-box">
          Hafenaufsicht und Raum-Patrouillen können Frachtkontrollen anordnen.
          Frachtpapiere, Durchsuchung, Bestechung im Hafen sowie Flucht oder
          Widerstand im Raum haben unterschiedliche Konsequenzen.
        </div>
      </div>
    </section>
  `;
}
