import type { CampaignDefinition, CampaignPackageInfo } from '../../core/campaign-types';

export interface CampaignSelectionEntry extends CampaignPackageInfo {
  readonly description: string;
  readonly enabled: boolean;
}

export interface CampaignSelection {
  list(): readonly CampaignSelectionEntry[];
  setEnabled(id: string, enabled: boolean): boolean;
  /** Detached, JSON-compatible choices for one game launch; not a savegame. */
  snapshot(): Readonly<Record<string, boolean>>;
}

/** Selection belongs to the current main-menu session, not to the DOM. */
export function createCampaignSelection(
  packages: readonly CampaignDefinition[]
): CampaignSelection {
  const definitions = new Map<string, CampaignDefinition>();
  const enabled = new Map<string, boolean>();
  for (const definition of packages) {
    if (definitions.has(definition.id)) throw new Error('Duplicate campaign: ' + definition.id);
    definitions.set(definition.id, definition);
    enabled.set(
      definition.id,
      definition.category === 'core' || definition.defaultEnabled !== false
    );
  }
  return {
    list: () =>
      [...definitions.values()].map((definition) => ({
        id: definition.id,
        title: definition.title,
        version: definition.version,
        category: definition.category ?? 'optional',
        defaultEnabled: definition.defaultEnabled !== false,
        description: definition.description ?? '',
        enabled: enabled.get(definition.id) === true,
      })),
    setEnabled(id, value) {
      const definition = definitions.get(id);
      if (!definition || definition.category === 'core') return false;
      enabled.set(id, value);
      return true;
    },
    snapshot: () => Object.fromEntries(enabled),
  };
}
