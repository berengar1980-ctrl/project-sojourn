import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import { campaignCombatResult } from '../../systems/combat/combat-result-summary';

/** FleetCombat outcome uses the existing campaign result notice; no new map or renderer. */
export function showFleetCombatResult(
  root: HTMLElement,
  victory: boolean,
  hullHp: number,
  hullMaxHp: number,
  onContinue: () => void
): void {
  const document = root.ownerDocument;
  document.querySelector('.campaign-combat-summary')?.remove();
  const notice = document.createElement('aside');
  notice.className = 'campaign-combat-summary';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.style.cssText =
    'position:fixed;right:18px;bottom:18px;z-index:900;max-width:min(330px,calc(100vw - 36px));' +
    'padding:12px 15px;border:1px solid #57707a;border-left:3px solid #91b2bd;' +
    'background:rgba(11,20,26,.94);box-shadow:0 8px 22px rgba(0,0,0,.4);' +
    'color:#d9e7ea;font:12px ui-monospace,monospace;line-height:1.6;pointer-events:none;';
  const heading = document.createElement('strong');
  heading.textContent = 'FLEETCOMBAT · ' + (victory ? 'SIEG' : 'NIEDERLAGE');
  heading.style.display = 'block';
  const details = document.createElement('span');
  details.textContent = 'Eigene Hülle: ' + Math.max(0, hullHp) + '/' + hullMaxHp;
  notice.append(heading, details);
  document.body.append(notice);
  setTimeout(onContinue, 0);
  setTimeout(() => notice.remove(), 5500);
}

/** Non-modal outcome indicator; the combat explosion and map remain unobstructed. */
export function showCampaignCombatSummary(
  root: HTMLElement,
  snapshot: StrategicCombatSnapshot,
  onContinue: () => void,
  boardingOutcome?: string
): void {
  const result = campaignCombatResult(snapshot);
  const document = root.ownerDocument;
  document.querySelector('.campaign-combat-summary')?.remove();
  const notice = document.createElement('aside');
  notice.className = 'campaign-combat-summary';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-label', 'Kampfergebnis');
  notice.style.cssText =
    'position:fixed;right:18px;bottom:18px;z-index:900;max-width:min(330px,calc(100vw - 36px));' +
    'padding:12px 15px;border:1px solid #57707a;border-left:3px solid #91b2bd;' +
    'background:rgba(11,20,26,.94);box-shadow:0 8px 22px rgba(0,0,0,.4);' +
    'color:#d9e7ea;font:12px ui-monospace,monospace;line-height:1.6;pointer-events:none;';
  const heading = document.createElement('strong');
  heading.textContent = 'KAMPFABSCHLUSS · ' + result.outcome;
  heading.style.display = 'block';
  const details = document.createElement('span');
  details.textContent =
    'Gegner: ' +
    result.enemy +
    ' · Eigene Hülle: ' +
    result.playerHull +
    '/' +
    result.playerHullMax +
    ' · Dauer: ' +
    result.duration +
    ' s';
  const loot = document.createElement('small');
  loot.style.cssText = 'display:block;color:#9fadb3;margin-top:5px;';
  loot.textContent = boardingOutcome
    ? 'Enterergebnis: ' + boardingOutcome
    : 'Bergbare Wracks können im Einsatzgebiet geborgen werden.';
  notice.append(heading, details, loot);
  document.body.append(notice);
  // Resume after this frame so scene transitions cannot run inside the combat tick.
  setTimeout(onContinue, 0);
  setTimeout(() => notice.remove(), 5500);
}
