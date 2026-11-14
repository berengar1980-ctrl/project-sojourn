import { PENAL_LABOR_CREDITS_PER_DAY } from '../../systems/operations/sector-legal-registry';

export interface DetentionPanel {
  update(days: number, debt: number, laborCredits: number): void;
  destroy(): void;
}

/** Rendering only: penal labor and payments remain in the legal domain. */
export function createDetentionPanel(root: HTMLElement): DetentionPanel {
  const panel = document.createElement('section');
  panel.className = 'directorate-detention-panel';
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  panel.style.cssText =
    'position:fixed;inset:0;z-index:10000;background:rgba(4,8,14,.96);' +
    'color:#e6e9ec;display:grid;place-content:center;text-align:center;' +
    'font:18px system-ui;padding:32px;pointer-events:all;white-space:pre-line';
  root.appendChild(panel);
  return {
    update(days, debt, laborCredits) {
      panel.textContent =
        'TERRANISCHES DIREKTORUM – STRAFLAGER\n' +
        'Hafttag: ' + days +
        '\nRestschuld: ' + debt.toLocaleString('de-DE') + ' CR' +
        '\nArbeitsgutschrift: ' + laborCredits.toLocaleString('de-DE') +
        ' CR (' + PENAL_LABOR_CREDITS_PER_DAY + ' CR / Tag)';
    },
    destroy() {
      panel.remove();
    },
  };
}
