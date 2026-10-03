import { createInitialState } from '../core/state.js';
import { renderApp } from '../ui/render-app.js';

export function bootstrap(root) {
  if (!root) throw new Error('SOJOURN app root is missing.');
  renderApp(root, createInitialState());
}
