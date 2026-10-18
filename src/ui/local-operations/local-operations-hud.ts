/** Shared controls for mining, wreck salvage and distress-rescue local fields. */
export function localOperationsHeader(kind: string, title: string): string {
  return [
    '<div class="local-space-title"><span>', kind, '</span><strong>', title,
    '</strong></div>',
    '<nav class="local-operations-toolbar" aria-label="Einsatzsteuerung">',
    '<button class="return-map-button" type="button">ZUR STERNKARTE</button>',
    '<button class="long-scan-button" type="button">FERNBEREICHSSCAN</button>',
    '<button class="scan-label-toggle is-active" type="button">SCAN-DATEN AN</button>',
    '</nav>',
    '<div class="local-operations-feedback">',
    '<div class="local-operations-status" role="status" aria-live="polite" hidden></div>',
    '<button class="operations-cancel-button" type="button" hidden>VORGANG ABBRECHEN</button>',
    '</div>',
  ].join('');
}

export function updateLongRangeScanButton(
  button: HTMLButtonElement,
  available: boolean,
  progress: number | null,
  blocked = false
): void {
  button.disabled = blocked || !available || progress !== null;
  button.textContent = !available
    ? 'SCAN NICHT VERFÜGBAR'
    : progress !== null
      ? 'FERNBEREICHSSCAN · ' + Math.round(progress * 100) + ' %'
      : 'FERNBEREICHSSCAN';
  button.title = !available ? 'Kein betriebsbereites Scansystem' : '';
}

export function bindScanDataToggle(
  button: HTMLButtonElement,
  setVisible: (visible: boolean) => void
): void {
  let visible = true;
  button.addEventListener('click', () => {
    visible = !visible;
    setVisible(visible);
    button.classList.toggle('is-active', visible);
    button.textContent = visible ? 'SCAN-DATEN AN' : 'SCAN-DATEN AUS';
    button.setAttribute('aria-pressed', String(visible));
  });
  button.setAttribute('aria-pressed', 'true');
}
