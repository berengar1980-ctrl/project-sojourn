import type { CrewSocialAxis } from '../../core/crew-types';

export interface CrewSocialAxisDefinition {
  readonly id: CrewSocialAxis;
  readonly positive: string;
  readonly negative: string;
}

export const crewSocialAxes = [
  { id: 'loyalty', positive: 'Loyal', negative: 'Egoistisch' },
  { id: 'order', positive: 'Ordnungstreu', negative: 'Freiheitsliebend' },
  { id: 'duty', positive: 'Pflichtbewusst', negative: 'Opportunistisch' },
  { id: 'risk', positive: 'Vorsichtig', negative: 'Waghalsig' },
  { id: 'empathy', positive: 'Mitfühlend', negative: 'Skrupellos' },
  { id: 'faith', positive: 'Gläubig', negative: 'Skeptisch' },
  { id: 'cunning', positive: 'Gerissen', negative: 'Naiv' },
  { id: 'trust', positive: 'Vertrauensvoll', negative: 'Misstrauisch' },
] as const satisfies readonly CrewSocialAxisDefinition[];
