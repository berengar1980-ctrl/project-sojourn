import { createInitialState } from '../core/state';
import { renderApp } from '../ui/render-app';

export function bootstrap(root: HTMLElement | null): void {
  if (!root) {
    throw new Error('SOJOURN app root is missing.');
  }

  renderApp(root, createInitialState());
}
