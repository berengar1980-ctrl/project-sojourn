import type { CrewDefinition } from '../../core/crew-types';
import { crewDefinitions1 } from './crew-definitions-1';
import { crewDefinitions2 } from './crew-definitions-2';
import { crewDefinitions3 } from './crew-definitions-3';
export const crewDefinitions = [
  ...crewDefinitions1,
  ...crewDefinitions2,
  ...crewDefinitions3,
] as const;

export function crewDefinitionById(id: string): CrewDefinition | null {
  return crewDefinitions.find((definition) => definition.id === id) ?? null;
}
