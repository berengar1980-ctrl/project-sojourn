export function runSceneZoomTransition(
  root: HTMLElement,
  swapScene: () => void
): void {
  const overlay = document.createElement('div');
  overlay.className = 'scene-zoom-transition';
  root.append(overlay);

  requestAnimationFrame(() => overlay.classList.add('is-active'));

  window.setTimeout(() => {
    swapScene();
    overlay.classList.add('is-swapped');
  }, 220);

  window.setTimeout(() => overlay.remove(), 520);
}
