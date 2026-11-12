import type { CustomsAction, SmugglingService } from '../../systems/economy/smuggling-service';

export interface CustomsInspectionPanel {
  destroy(): void;
}

/** Mandatory inspection overlay: the caller pauses travel and trade while it is open. */
export function createCustomsInspectionPanel(
  root: HTMLElement,
  smuggling: SmugglingService,
  shipId: string,
  normalCapacity: number,
  onClosed: (outcome: string | undefined, patrolId: string | undefined) => void
): CustomsInspectionPanel {
  const backdrop = document.createElement('section');
  backdrop.className = 'customs-mandatory-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Angeordnete Frachtprüfung');
  backdrop.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:rgba(2,7,14,.94);display:grid;place-items:center;padding:20px;color:#dbe6ea;';
  const panel = document.createElement('article');
  panel.style.cssText =
    'width:min(760px,94vw);max-height:90vh;overflow:auto;padding:28px;background:#14212b;border:1px solid #718d96;box-shadow:0 24px 100px #000;font-family:inherit;';
  backdrop.append(panel);
  root.append(backdrop);
  function draw(): void {
    const inspection = smuggling.state.inspection;
    if (!inspection) return;
    const harbor = inspection.source === 'harbor';
    const result = inspection.stage === 'result';
    const buttons: { action: CustomsAction; label: string; disabled?: boolean }[] = result
      ? [{ action: 'ack', label: 'ERGEBNIS BESTÄTIGEN · FREIGABE' }]
      : [
          {
            action: 'papers',
            label: 'FRACHTPAPIERE ÜBERMITTELN',
            disabled: inspection.papersTried,
          },
          { action: 'comply', label: 'LADERÄUME ZUR KONTROLLE FREIGEBEN' },
          ...(harbor
            ? [
                {
                  action: 'bribe' as const,
                  label:
                    'DISKRETE ZAHLUNG ANBIETEN · ' +
                    smuggling.bribeQuote(normalCapacity).toLocaleString('de-DE') +
                    ' CR',
                  disabled: inspection.bribeTried,
                },
              ]
            : [
                { action: 'flee' as const, label: 'FLUCHT VERSUCHEN' },
                { action: 'fight' as const, label: 'BEWAFFNET WIDERSTAND LEISTEN' },
              ]),
        ];
    const escaped = (value: string): string =>
      value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    panel.innerHTML = `
      <small style="letter-spacing:.15em;color:#8fafb8">${harbor ? 'HAFENAUFSICHT' : 'FLOTTENPATROUILLE'} · VERPFLICHTENDE KONTROLLE</small>
      <h2 style="margin:12px 0 16px;color:#fff;font-size:1.6rem">Frachtprüfung angeordnet</h2>
      <p>${harbor ? 'Beim Anlegen wurden Unregelmäßigkeiten in den Ladepapieren festgestellt.' : 'Eine Patrouille verlangt Beidrehen und die Freigabe des Frachtmanifests.'}</p>
      <p style="color:#b6c4c8">${result ? escaped(inspection.summary ?? 'Inspektion abgeschlossen') : 'Noch wurde keine verbotene Ware nachgewiesen. Du kannst Papiere vorlegen, eine physische Kontrolle zulassen oder andere Maßnahmen versuchen.'}</p>
      <p style="font-size:.85rem;color:#9aafb6">VERDACHT ${Math.round(smuggling.state.suspicion)}/100 · ${harbor ? 'HAFENKONTROLLE' : 'KONTROLLE IM RAUM'}</p>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:24px">
      ${buttons
        .map(
          (button) =>
            `<button type="button" data-customs-action="${button.action}" ${button.disabled ? 'disabled' : ''} style="padding:12px 16px;background:#243945;color:#fff;border:1px solid #78949a;cursor:pointer">${escaped(button.label)}</button>`
        )
        .join('')}
      </div>
    `;
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-customs-action]')) {
      button.addEventListener('click', () => {
        const action = button.dataset.customsAction as CustomsAction;
        const before = smuggling.state.inspection;
        smuggling.decide(action, shipId, normalCapacity);
        if (!smuggling.state.inspection) {
          backdrop.remove();
          onClosed(before?.outcome, before?.patrolId);
          return;
        }
        draw();
      });
    }
  }
  draw();
  return {
    destroy(): void {
      backdrop.remove();
    },
  };
}
