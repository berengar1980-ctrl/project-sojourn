/** One-time in-world message announcing the Voidbound-style underground shipyard lead. */
export function showUnderworldContactNotice(root: HTMLElement): void {
  if (root.querySelector('[data-underworld-contact-notice]')) return;
  const backdrop = document.createElement('div');
  backdrop.dataset.underworldContactNotice = 'true';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Abgefangene Unterwelt-Nachricht');
  backdrop.style.cssText =
    'position:fixed;inset:0;z-index:10000;background:rgba(2,7,13,.92);display:grid;place-items:center;padding:20px;color:#d7e4e7';
  const card = document.createElement('section');
  card.style.cssText =
    'width:min(640px,95vw);background:#101c27;border:1px solid #748995;padding:28px;box-shadow:0 24px 80px #000;font-family:inherit';
  card.innerHTML = `
    <div style="color:#d4a76f;letter-spacing:.15em;font-size:.8rem">VERSCHLÜSSELTE ÜBERTRAGUNG // UNBEKANNTE QUELLE</div>
    <h2 style="margin:14px 0;color:#fff">Ein Kontakt aus dem Unterdeck</h2>
    <p>Eine Nachricht erreicht dein Terminal über einen längst abgeschalteten Hafenkanal. Kein Absender, keine amtliche Kennung. Nur eine Koordinate und ein Angebot.</p>
    <p style="border-left:2px solid #d4a76f;padding:8px 14px;color:#e8d8c0;font-style:italic">
      „Deine Fracht muss nicht immer auf dem Manifest stehen. In Blackjaw und Gallows kennen wir Werften, die mehr verstehen als die Offiziellen. Wenn du wissen willst, wo die Hohlräume liegen, bring 300.000 Credits mit.“</p>
    <p>Der Kontakt ist jetzt im Reiter <strong>SCHMUGGEL</strong> verfügbar. Für den Umbau selbst werden später weitere 750.000 Credits fällig. Der Einbau ist nur an Piratenstützpunkten möglich.</p>
    <button type="button" data-underworld-ack style="margin-top:14px;padding:12px 22px;background:#304451;color:#fff;border:1px solid #c2a77b;cursor:pointer">NACHRICHT SPEICHERN · SCHLIESSEN</button>`;
  backdrop.append(card);
  root.append(backdrop);
  card.querySelector('[data-underworld-ack]')?.addEventListener('click', () => backdrop.remove());
}
