import type { StrategicCombatantSnapshot } from '../../systems/combat/strategic-combat-types';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function fmt(value: number): string {
  return Number(value.toFixed(1)).toLocaleString('de-DE');
}

function shortMountLabel(label: string, ordinal: number): string {
  if (label === 'Bugwaffe') return 'BUG ' + ordinal;
  if (label === 'Universalwaffe') return 'TUR ' + ordinal;
  if (label === 'Backbordwaffe') return 'BB';
  if (label === 'Steuerbordwaffe') return 'SB';
  return 'W' + ordinal;
}

/** Lightweight 10 Hz HUD rendering; shot/damage counters are immutable combat snapshots. */
export function combatWeaponTelemetryHtml(
  ship: StrategicCombatantSnapshot,
  elapsedSeconds: number
): string {
  if (!ship.weaponTelemetry.length) return '';
  const slotNumbers = new Map<string, number>();
  const rows = [...ship.weaponTelemetry]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((weapon) => {
      const ordinal = (slotNumbers.get(weapon.mountLabel) ?? 0) + 1;
      slotNumbers.set(weapon.mountLabel, ordinal);
      const prefix = shortMountLabel(weapon.mountLabel, ordinal);
      const weaponLabel = prefix + ' · ' + weapon.weaponName;
      const remaining = Math.max(0, weapon.cooldownRemaining);
      const ready = remaining < 0.01;
      const fired = weapon.lastFiredAt !== null && elapsedSeconds - weapon.lastFiredAt < 0.6;
      const reload = Math.max(0.01, weapon.cooldownSeconds);
      const progress = Math.round(Math.max(0, Math.min(100, (remaining / reload) * 100)));
      const state = fired ? 'fired' : ready ? 'ready' : 'cooldown';
      const countdown = ready ? 'BEREIT' : remaining.toFixed(1) + 's';
      return `
        <div class="combat-weapon-row combat-weapon-row--${state}">
          <div class="combat-weapon-row__main">
            <span class="combat-weapon-row__name" title="${escapeHtml(weaponLabel)}">
              ${escapeHtml(weaponLabel)}
            </span>
            <span class="combat-weapon-row__cd">${countdown}</span>
            <span class="combat-weapon-row__shield">${fmt(weapon.shieldDamageDealt)}</span>
            <span class="combat-weapon-row__hull">${fmt(weapon.hullDamageDealt)}</span>
            <span class="combat-weapon-row__shots">${weapon.shotsFired}</span>
          </div>
          <div class="combat-weapon-row__bar">
            <i style="width:${progress}%"></i>
          </div>
        </div>
      `;
    })
    .join('');
  return `
    <section class="combat-weapon-telemetry" aria-label="Waffenwirkung und Abklingzeiten">
      <div class="combat-weapon-telemetry__title">FEUERLEITUNG · WAFFEN</div>
      <div class="combat-weapon-telemetry__columns">
        <span>WAFFE</span><span>CD</span><span>SCHILD</span><span>HÜLLE</span><span>∑</span>
      </div>
      ${rows}
    </section>
  `;
}
