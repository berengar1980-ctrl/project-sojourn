/** Immediate visible feedback while a mining/salvage event is being resolved. */
export function renderOperationEventFeedback(
  container: HTMLElement,
  result: { readonly title: string; readonly resultText: string } | null,
  seconds: number | null,
  operation: 'mining' | 'salvage'
): void {
  container.hidden = false;
  if (!container.querySelector('.operations-event-feedback__busy')) {
    const kicker = document.createElement('div');
    kicker.className = 'operations-event-feedback__kicker';
    kicker.textContent = 'ENTSCHEIDUNG ÜBERMITTELT // VERARBEITUNG';
    const title = document.createElement('h3');
    title.textContent =
      result?.title ??
      (operation === 'mining' ? 'Bergbausysteme stabilisieren' : 'Bergungsteam sichert Sektion');
    const description = document.createElement('p');
    description.textContent =
      result?.resultText ??
      (operation === 'mining'
        ? 'Mining wird nach der Systemprüfung fortgesetzt.'
        : 'Bergung wird nach der Sicherheitsprüfung fortgesetzt.');
    const busy = document.createElement('div');
    busy.className = 'operations-event-feedback__busy';
    busy.setAttribute('role', 'status');
    busy.setAttribute('aria-live', 'polite');
    const status = document.createElement('span');
    status.className = 'operations-event-feedback__remaining';
    const activity = document.createElement('div');
    activity.className = 'operations-event-feedback__activity';
    activity.setAttribute('aria-hidden', 'true');
    busy.append(status, activity);
    container.replaceChildren(kicker, title, description, busy);
  }
  const remaining = container.querySelector<HTMLElement>('.operations-event-feedback__remaining');
  if (remaining) {
    remaining.textContent =
      seconds === null
        ? 'ENTSCHEIDUNG WIRD AUSGEFÜHRT…'
        : 'SYSTEME STABILISIEREN · ' + Math.ceil(seconds) + ' s';
  }
}
