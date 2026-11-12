interface Options {
  readonly onBuyHoldIntel: () => void;
  readonly onInstallHiddenHold: () => void;
  readonly onConcealCargo: (resourceId: string) => void;
  readonly onRevealCargo: (resourceId: string) => void;
  readonly onPirateProtection: () => void;
}

export function bindSmugglingPortActions(shell: HTMLElement, options: Options): void {
  shell
    .querySelector<HTMLButtonElement>('[data-buy-hold-intel]')
    ?.addEventListener('click', options.onBuyHoldIntel);
  shell
    .querySelector<HTMLButtonElement>('[data-install-hidden-hold]')
    ?.addEventListener('click', options.onInstallHiddenHold);
  shell
    .querySelector<HTMLButtonElement>('[data-pirate-protection]')
    ?.addEventListener('click', options.onPirateProtection);
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-hide-cargo]')) {
    button.addEventListener('click', () => options.onConcealCargo(button.dataset.hideCargo ?? ''));
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-unhide-cargo]')) {
    button.addEventListener('click', () => options.onRevealCargo(button.dataset.unhideCargo ?? ''));
  }
}
