import type { BlockadeService } from '../../systems/operations/blockade-service';
import type { PatrolCareerService } from '../../systems/operations/patrol-career-service';
import type { AsteroidClaimRegistry } from '../../systems/operations/asteroid-claim-registry';
import './operations.css';

export interface OperationsModel {
  credits: number;
  port: boolean;
  patrolShip: boolean;
  locationId: string | null;
  locationName: string;
  locations: { id: string; name: string; resources: { id: string; name: string }[] }[];
  pirates: { id: string; name: string }[];
  blockades: ReturnType<BlockadeService['snapshot']>;
  patrol: ReturnType<PatrolCareerService['snapshot']>;
  offers: ReturnType<PatrolCareerService['offers']>;
  claims: ReturnType<AsteroidClaimRegistry['snapshot']>['claims'];
  names: Record<string, string>;
}
export type OperationsAction =
  'order' | 'cancel' | 'enlist' | 'resign' | 'accept' | 'reward' | 'navigate' | 'claim-route';
interface Options {
  root: HTMLElement;
  onClose: () => void;
  model: () => OperationsModel;
  quote: (ids: string[], days: number) => number | null;
  act: (action: OperationsAction, values: string[]) => string;
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
const money = (value: number) => value.toLocaleString('de-DE') + ' CR';
const button = (action: OperationsAction, text: string, value = '', disabled = false) =>
  `<button type="button" data-op="${action}" data-value="${escape(value)}" ${disabled ? 'disabled' : ''}>${escape(text)}</button>`;
const phaseNames = {
  assembling: 'Anflug / Sammlung',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
  defeated: 'Geschlagen',
  cancelled: 'Abgebrochen',
};
function blockadeMarkup(m: OperationsModel): string {
  const rows = m.blockades.orders
    .slice(-12)
    .map(
      (
        o
      ) => `<li><strong>${escape(m.names[o.locationId] ?? o.locationId)} · ${escape(m.names[o.resourceId] ?? o.resourceId)}</strong>
    <p>${phaseNames[o.phase]} · ${o.startedDay === null ? 'Dauer wartet auf Ankunft' : Math.max(0, o.startedDay + o.duration - m.blockades.day) + ' Tage verbleibend'} · ${o.removedStock} t Depotverluste · Preis: ${money(o.currentPrice)}${o.startPrice === null ? '' : ' (bei Beginn ' + money(o.startPrice) + ')'}</p>
    ${o.ownerId === 'player' && ['active', 'assembling'].includes(o.phase) ? button('cancel', 'Abbrechen · keine Erstattung', o.id) : ''}</li>`
    )
    .join('');
  return `<h3>Korsarenblockaden</h3><p>1–3 bestehende Korsaren beauftragen. Anflug und Gefechte sind real. Die Laufzeit beginnt erst mit der vollständigen Einsatzgruppe am Ziel. Gewinne sind nicht garantiert.</p>
    <label>Importhafen<select data-blockade-location>${m.locations.map((l) => `<option value="${l.id}">${escape(l.name)}</option>`).join('')}</select></label>
    <label>Importware<select data-blockade-resource></select></label>
    <label>Einsatzdauer<select data-blockade-duration><option>7</option><option selected>10</option><option>14</option></select> Tage</label>
    <fieldset><legend>Verfügbare Korsaren</legend>${m.pirates.map((p) => `<label><input type="checkbox" value="${p.id}" data-blockade-pirate> ${escape(p.name)}</label>`).join('') || 'Zurzeit keine einsatzbereiten Korsaren frei.'}</fieldset>
    <p data-blockade-quote>Wähle eine Einsatzgruppe.</p>${button('order', 'Blockade verbindlich beauftragen', '', !m.port)}
    <p data-blockade-reason class="operations-hint"></p><ul>${rows || '<li>Keine Blockadeaufträge.</li>'}</ul>
    <p>Handelshäuser · Alarm Veylan ${m.blockades.houseAlarm.veylan ?? 0}/100 · Mercator ${m.blockades.houseAlarm.mercator ?? 0}/100</p>`;
}
function patrolMarkup(m: OperationsModel): string {
  const p = m.patrol;
  return `<h3>Patrouillendienst</h3><p>Für ein Sicherheitsmandat brauchst du ein Patrouillenschiff in einem zivilen Hafen.</p><p>${p.mandate ? 'Im Dienst' : 'Kein Mandat'} · ${p.rank} · Ruf ${p.reputation} · ${p.completed} Einsätze abgeschlossen</p>
    ${button(p.mandate ? 'resign' : 'enlist', p.mandate ? 'Dienst quittieren' : 'Sicherheitsmandat übernehmen', '', !m.port || !m.patrolShip)}
    ${!m.port ? '<p class="operations-hint">Gesperrt: zuerst an einem zivilen Hafen andocken.</p>' : !m.patrolShip ? '<p class="operations-hint">Gesperrt: ein Patrouillenschiff als aktives Schiff wählen.</p>' : ''}
    <p>Mandat und Aufträge am zivilen Hafen mit einem Patrouillenschiff. Angriffe auf zivile Schiffe entziehen das Mandat. Handelswege gelten nach 12 Sekunden Aufenthalt ohne aktive Korsaren am Ziel als gesichert. Einsätze verfallen nach 14 Tagen; Auszahlung am Hafen.</p>
    ${p.assignments
      .slice(-6)
      .map(
        (a) =>
          `<p>${a.kind === 'route' ? 'Handelsweg sichern' : 'Piraten verfolgen'}: ${escape(m.names[a.targetId] ?? a.targetId)} · ${escape(a.status)} · ${money(a.reward)} · Frist Tag ${a.deadline}</p>${a.status === 'active' && a.kind === 'route' ? button('navigate', 'Ziel auswählen', a.targetId) : ''}`
      )
      .join('')}
    ${button('reward', 'Abgeschlossenen Einsatz abrechnen', '', !m.port || !p.assignments.some((a) => a.status === 'completed'))}
    <label>Einsatz auswählen<select data-patrol-offer>${m.offers
      .filter((o) => o.targetId !== m.locationId)
      .map(
        (o) =>
          `<option value="${o.kind}|${o.targetId}">${o.kind === 'route' ? 'Handelsweg sichern' : 'Piraten verfolgen'} · ${escape(o.name)} · ${money(o.reward)}</option>`
      )
      .join('')}</select></label>
    ${button('accept', 'Einsatz annehmen', '', !m.port || !p.mandate || !m.patrolShip || p.assignments.some((a) => ['active', 'completed'].includes(a.status)))}`;
}
function concessionMarkup(m: OperationsModel): string {
  const claims = [...m.claims].sort((a, b) => b.registeredDay - a.registeredDay);
  const rows = claims
    .map((claim) => {
      const isOwn = claim.ownerId === 'player';
      const resources = Object.entries(claim.oreAtRegistration)
        .map(([id, amount]) => escape(m.names[id] ?? id) + ' ~' + Math.round(amount) + ' t')
        .join(' · ');
      return `<li>
      <strong>${escape(m.names[claim.locationId] ?? claim.locationId)} / ${escape(claim.asteroidId)}</strong>
      <p>${isOwn ? 'EIGENE KONZESSION' : 'FREMDE KONZESSION · ' + escape(m.names[claim.ownerId] ?? claim.ownerId)}
      · registriert Tag ${claim.registeredDay}</p>
      <p>${resources || 'Keine gemeldeten Reserven'}</p>
      <small>Mengen entsprechen dem Registereintrag und können veraltet sein.</small>
      ${button('claim-route', 'Kurs zum Abbaugebiet setzen', claim.locationId + '|' + claim.asteroidId)}
    </li>`;
    })
    .join('');
  return `<h3>Öffentliches Konzessionsregister</h3>
    <p>Registrierte Einzelasteroiden. Fremde Konzessionen können gezielt angeflogen
    werden. Unbefugte Förderung kann zu Forderungen und Fahndungen führen.</p>
    <ul>${rows || '<li>Noch keine registrierten Konzessionen.</li>'}</ul>`;
}
function updateBlockadeReason(
  dialog: HTMLDialogElement,
  m: OperationsModel,
  cost: number | null
): void {
  const reason = dialog.querySelector('[data-blockade-reason]');
  if (reason)
    reason.textContent = !m.port
      ? 'Gesperrt: zuerst an einem zivilen Hafen andocken.'
      : cost === null
        ? 'Wähle 1–3 verfügbare Korsaren.'
        : cost > m.credits
          ? 'Gesperrt: nicht genügend Credits.'
          : 'Bereit. Beauftragte Korsaren sind dir gegenüber während des Einsatzes verbündet.';
}

export function createOperationsPanel(options: Options): { destroy(): void } {
  const launch = document.createElement('button');
  launch.type = 'button';
  launch.className = 'operations-launch';
  launch.textContent = 'AUFTRÄGE & KONZESSIONEN';
  const dialog = document.createElement('dialog');
  dialog.className = 'operations-dialog';
  options.root.append(launch, dialog);
  let tab = 'blockades';
  let message = '';
  let currentModel: OperationsModel | null = null;
  const model = () => currentModel ?? (currentModel = options.model());
  const value = (selector: string) =>
    dialog.querySelector<HTMLSelectElement>(selector)?.value ?? '';
  const pirates = () =>
    [...dialog.querySelectorAll<HTMLInputElement>('[data-blockade-pirate]:checked')].map(
      (input) => input.value
    );
  function resources() {
    const select = dialog.querySelector<HTMLSelectElement>('[data-blockade-resource]');
    if (select)
      select.innerHTML =
        model()
          .locations.find((l) => l.id === value('[data-blockade-location]'))
          ?.resources.map((r) => `<option value="${r.id}">${escape(r.name)}</option>`)
          .join('') ?? '';
  }
  function quote() {
    const cost = options.quote(pirates(), Number(value('[data-blockade-duration]')));
    const m = model();
    const label = dialog.querySelector('[data-blockade-quote]');
    if (label)
      label.textContent =
        cost === null ? 'Wähle 1–3 verfügbare Korsaren.' : 'Gesamtpreis: ' + money(cost);
    const order = dialog.querySelector<HTMLButtonElement>('[data-op="order"]');
    if (order) order.disabled = !m.port || cost === null || cost > m.credits;
    updateBlockadeReason(dialog, m, cost);
  }
  function render() {
    currentModel = options.model();
    const m = currentModel;
    dialog.innerHTML = `<header><h2>Aufträge & Konzessionen</h2><button type="button" data-close>Schließen</button></header><p>${money(m.credits)} · Tag ${m.blockades.day}</p>
      <nav>${[
        ['blockades', 'Blockaden'],
        ['patrol', 'Patrouille'],
        ['claims', 'Konzessionsregister'],
      ]
        .map(
          ([id, label]) =>
            `<button type="button" data-tab="${id}" aria-pressed="${tab === id}">${label}</button>`
        )
        .join('')}</nav>
      ${message ? `<p role="status">${escape(message)}</p>` : ''}<section>${tab === 'blockades' ? blockadeMarkup(m) : tab === 'claims' ? concessionMarkup(m) : patrolMarkup(m)}</section>`;
    resources();
    quote();
  }
  launch.onclick = () => {
    render();
    dialog.showModal();
  };
  dialog.onclose = options.onClose;
  dialog.onchange = (event) => {
    if ((event.target as HTMLElement).matches('[data-blockade-location]')) resources();
    quote();
  };
  dialog.onclick = (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target) return;
    if (target.hasAttribute('data-close')) {
      dialog.close();
      return;
    }
    if (target.dataset.tab) {
      tab = target.dataset.tab;
      render();
      return;
    }
    const action = target.dataset.op as OperationsAction | undefined;
    if (!action) return;
    let values = [target.dataset.value ?? ''];
    if (action === 'order')
      values = [
        value('[data-blockade-location]'),
        value('[data-blockade-resource]'),
        value('[data-blockade-duration]'),
        ...pirates(),
      ];
    if (action === 'accept') values = value('[data-patrol-offer]').split('|');
    message = options.act(action, values);
    render();
  };
  return {
    destroy() {
      dialog.remove();
      launch.remove();
    },
  };
}
