import type { ShipDefinition } from '../../systems/ships';
import { fitsWeaponHardpoint } from '../../systems/ships';
import type { ShipWeaponHardpoint } from '../../core/ship-types';
import { weaponHardpointDescription, weaponUiGroup, weaponUiOrder } from '../../core/weapon-hardpoint-labels';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { nativeWeaponDamage } from '../../systems/combat/combat-native-damage';
import type { DuelDraft } from './duel-combatant-setup';

function element<K extends keyof HTMLElementTagNameMap>(
  name: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDamage(value: number): string {
  return Number(value.toFixed(2)).toLocaleString('de-DE');
}

function updateStats(container: HTMLElement, id: string, mount: ShipWeaponHardpoint): void {
  const weapon = (SHIP_COMPONENT_CATALOG.weapon ?? []).find((entry) => entry.id === id);
  container.replaceChildren();
  if (!weapon?.weapon) {
    container.append(element('span', 'duel-weapon__empty', 'Kein Waffensystem installiert'));
    return;
  }
  const profile = weapon.weapon;
  const damage = nativeWeaponDamage(weapon);
  const role =
    damage.shieldDamage >= damage.hullDamage * 1.5
      ? 'shield'
      : damage.hullDamage >= damage.shieldDamage * 1.5
        ? 'hull'
        : 'balanced';
  const roleLabel = { shield: 'SCHILD', hull: 'HÜLLE', balanced: 'BEIDES' }[role];
  const tags = element('div', 'duel-weapon__tags');
  const roleNode = element('span', 'duel-weapon__role duel-weapon__role--' + role, roleLabel);
  tags.append(
    roleNode,
    element('span', 'duel-weapon__meta', 'CD ' + profile.cooldownSeconds.toFixed(2) + ' s'),
    element('span', 'duel-weapon__meta', profile.rangeMeters + ' m'),
    element(
      'span',
      'duel-weapon__meta',
      Math.min(profile.arcDegrees ?? 360, mount.arcDegrees ?? 360) + '°'
    )
  );
  const damageNode = element('div', 'duel-weapon__damage');
  damageNode.append(
    element('span', 'duel-weapon__damage-shield', 'SCHILD  ' + formatDamage(damage.shieldDamage)),
    element('span', 'duel-weapon__damage-hull', 'HÜLLE  ' + formatDamage(damage.hullDamage))
  );
  container.append(tags, damageNode);
}

function weaponSlotCard(
  draft: DuelDraft,
  ship: ShipDefinition,
  mount: ShipWeaponHardpoint,
  title: string
): HTMLElement {
  const card = element('div', 'duel-weapon');
  const label = element('label', 'duel-weapon__label', title);
  const select = document.createElement('select');
  select.setAttribute('aria-label', title);
  select.dataset.slotIndex = String(mount.slotIndex);
  select.append(new Option('Nicht ausgerüstet', ''));
  for (const component of SHIP_COMPONENT_CATALOG.weapon ?? []) {
    if (!component.weapon || !fitsWeaponHardpoint(ship, mount.slotIndex, component.weapon)) {
      continue;
    }
    select.append(new Option(component.name, component.id));
  }
  if (draft.weapons[mount.slotIndex] === undefined) {
    draft.weapons[mount.slotIndex] = select.options[1]?.value ?? '';
  }
  select.value = draft.weapons[mount.slotIndex] ?? '';
  label.append(select);
  const stats = element('div', 'duel-weapon__stats');
  updateStats(stats, select.value, mount);
  select.addEventListener('change', () => {
    draft.weapons[mount.slotIndex] = select.value;
    updateStats(stats, select.value, mount);
  });
  card.append(label, stats);
  return card;
}

/** UI order only: maintain the original mount slot indices for the real loadout. */
export function buildDuelWeaponSections(draft: DuelDraft, ship: ShipDefinition): HTMLElement[] {
  const mounts = [...(ship.sprite.hardpoints.weaponMounts ?? [])].sort(
    (a, b) => weaponUiOrder(a) - weaponUiOrder(b)
  );
  const sectionNames = {
    front: 'BUGWAFFEN',
    port: 'SEITENWAFFEN',
    starboard: 'SEITENWAFFEN',
    turret: 'UNIVERSALWAFFEN',
  };
  const groups = [
    { key: 'front', heading: sectionNames.front, mounts: mounts.filter((m) => weaponUiGroup(m) === 'front') },
    {
      key: 'sides',
      heading: sectionNames.port,
      mounts: mounts.filter((m) => {
        const group = weaponUiGroup(m);
        return group === 'port' || group === 'starboard';
      }),
    },
    {
      key: 'turret',
      heading: sectionNames.turret,
      mounts: mounts.filter((m) => weaponUiGroup(m) === 'turret'),
    },
  ];
  return groups
    .filter((group) => group.mounts.length > 0)
    .map((group) => {
      const section = element('section', 'duel-weapons');
      section.dataset.group = group.key;
      const title = element('h3', 'duel-weapons__heading', group.heading);
      const grid = element('div', 'duel-weapons__grid');
      for (const [index, mount] of group.mounts.entries()) {
        const label =
          group.key === 'front'
            ? 'Bugwaffe ' + (index + 1)
            : group.key === 'turret'
              ? 'Universalwaffe ' + (index + 1)
              : weaponHardpointDescription(mount).split(' · ')[0];
        grid.append(weaponSlotCard(draft, ship, mount, label));
      }
      section.append(title, grid);
      return section;
    });
}
