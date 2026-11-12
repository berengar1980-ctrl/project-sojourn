interface Options {
  readonly onBuy: (resourceId: string) => void;
  readonly onSell: (resourceId: string) => void;
  readonly onSellAll: (resourceId: string) => void;
  readonly onMarketRoute: (locationId: string) => void;
}

export function bindPortTradeActions(shell: HTMLElement, options: Options): void {
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
}
