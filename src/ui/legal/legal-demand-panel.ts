export interface LegalDemandPanel {
  destroy(): void;
}

/** Accessible, non-blocking alternative to window.confirm. */
export function createLegalDemandPanel(
  root: HTMLElement,
  title: string,
  message: string,
  canPay: boolean,
  decide: (decision: 'pay' | 'refuse') => void
): LegalDemandPanel {
  const overlay = document.createElement('section');
  overlay.className = 'legal-demand-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  const content = document.createElement('div');
  content.className = 'legal-demand-content';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const detail = document.createElement('p');
  detail.textContent = message;
  const controls = document.createElement('div');
  controls.className = 'legal-demand-controls';
  const pay = document.createElement('button');
  pay.type = 'button';
  pay.textContent = 'FORDERUNG BEZAHLEN';
  pay.disabled = !canPay;
  const refuse = document.createElement('button');
  refuse.type = 'button';
  refuse.textContent = 'VERWEIGERN';
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let closed = false;

  const close = (decision?: 'pay' | 'refuse'): void => {
    if (closed) return;
    closed = true;
    overlay.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    previous?.focus();
    if (decision) decide(decision);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close('refuse');
    } else if (event.key === 'Tab') {
      const first = canPay ? pay : refuse;
      const last = refuse;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  pay.addEventListener('click', () => close('pay'));
  refuse.addEventListener('click', () => close('refuse'));
  controls.append(pay, refuse);
  content.append(heading, detail, controls);
  overlay.append(content);
  overlay.addEventListener('keydown', onKeyDown);
  root.appendChild(overlay);
  (canPay ? pay : refuse).focus();
  return { destroy: () => close() };
}
