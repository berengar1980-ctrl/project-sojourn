import type { GameState } from '../core/state';

export function renderApp(root: HTMLElement, state: GameState): void {
  root.textContent = `SOJOURN · state v${state.version}`;
}
