/** A real overlay that paints before the expensive world initialisation starts. */
export interface CampaignLoadingScreen {
  update(progress: number): void;
  destroy(): void;
}

export function createCampaignLoadingScreen(): CampaignLoadingScreen {
  const shell = document.createElement('section');
  shell.className = 'campaign-loading';
  shell.setAttribute('role', 'status');
  shell.setAttribute('aria-label', 'Sektor wird vorbereitet');
  shell.innerHTML = `
    <div class="campaign-loading__panel">
      <span class="campaign-loading__eyebrow">SOJOURN // SEKTORINITIALISIERUNG</span>
      <h1>DEINE REISE BEGINNT</h1>
      <p>Schiffsverkehr, Handelsrouten und Sektorsysteme werden vorbereitet.</p>
      <div class="campaign-loading__track" aria-hidden="true">
        <div class="campaign-loading__progress"></div>
      </div>
      <strong class="campaign-loading__percent">0 %</strong>
    </div>
  `;
  const bar = shell.querySelector<HTMLElement>('.campaign-loading__progress')!;
  const percent = shell.querySelector<HTMLElement>('.campaign-loading__percent')!;
  document.body.append(shell);
  return {
    update(progress) {
      const value = Math.min(100, Math.max(0, Math.round(progress * 100)));
      bar.style.width = value + '%';
      percent.textContent = value + ' %';
    },
    destroy() {
      shell.remove();
    },
  };
}
