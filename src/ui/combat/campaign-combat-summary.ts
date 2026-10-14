import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import { campaignCombatResult } from '../../systems/combat/combat-result-summary';

/** One user-confirmed outcome screen for campaign encounters, never a second reward grant. */
export function showCampaignCombatSummary(
  root: HTMLElement,
  snapshot: StrategicCombatSnapshot,
  onContinue: () => void,
  boardingOutcome?: string
): void {
  const result = campaignCombatResult(snapshot);
  const overlay = document.createElement('section');
  overlay.className = 'campaign-combat-summary';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Kampfergebnis');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:rgba(4,8,18,.82);color:#d9edf5';
  const panel = document.createElement('div');
  panel.style.cssText =
    'max-width:480px;padding:30px;border:1px solid #66808c;background:#101923;font:16px sans-serif;line-height:1.7';
  const heading = document.createElement('h2');
  heading.textContent = 'KAMPFABSCHLUSS · ' + result.outcome;
  const details = document.createElement('p');
  details.textContent =
    'Gegner: ' +
    result.enemy +
    ' · Eigene Hülle: ' +
    result.playerHull +
    '/' +
    result.playerHullMax +
    ' · Gegnerhülle: ' +
    result.enemyHull +
    '/' +
    result.enemyHullMax +
    ' · Dauer: ' +
    result.duration +
    ' s';
  const loot = document.createElement('p');
  loot.textContent = boardingOutcome
    ? 'Enterergebnis: ' + boardingOutcome + '. Erbeutete Ausrüstung wird separat im Log erfasst.'
    : 'Keine automatische Kampfbeute vergeben. Verfügbare Bergung erfolgt im Feld.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'ZURÜCK ZUM SPIEL';
  button.addEventListener(
    'click',
    () => {
      overlay.remove();
      onContinue();
    },
    { once: true }
  );
  panel.append(heading, details, loot, button);
  overlay.append(panel);
  root.append(overlay);
  button.focus();
}
