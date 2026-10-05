import type {
  EconomyResourceDefinition,
  EconomyResourceId,
  ResourceCategoryId,
  ResourceLegality,
} from '../../core/economy-types';

function resource(
  id: EconomyResourceId,
  name: string,
  categoryId: ResourceCategoryId,
  category: string,
  basePrice: number,
  legality: ResourceLegality = 'legal'
): EconomyResourceDefinition {
  return { id, name, categoryId, category, basePrice, legality };
}

// prettier-ignore
export const economyResources: readonly EconomyResourceDefinition[] = [
  resource('ferrite', 'Ferriterz', 'raw', 'Rohstoffe', 40),
  resource('silicite', 'Silicit', 'raw', 'Rohstoffe', 48),
  resource('cuprium', 'Cuprium', 'raw', 'Rohstoffe', 62),
  resource('kharvium', 'Kharvium', 'raw', 'Rohstoffe', 88),
  resource('cobaltite', 'Cobaltit', 'raw', 'Rohstoffe', 122),
  resource('iridite', 'Iridit', 'raw', 'Rohstoffe', 185),
  resource('volucrium', 'Volucrium', 'raw', 'Rohstoffe', 280),
  resource('elydrase', 'Elydrase', 'raw', 'Rohstoffe', 430),
  resource('orvessium', 'Orvessium', 'raw', 'Rohstoffe', 720),
  resource('cyranthite', 'Cyranthit', 'raw', 'Rohstoffe', 1320),
  resource('carbon', 'Kohlenstoff', 'raw', 'Rohstoffe', 32),
  resource('sulfur', 'Schwefel', 'raw', 'Rohstoffe', 38),
  resource('rare-metals', 'Seltene Metalle', 'raw', 'Rohstoffe', 360),

  resource('steel', 'Stahl', 'industry', 'Industrie', 96),
  resource('composite-plate', 'Verbundplatten', 'industry', 'Industrie', 185),
  resource('industrial-ceramics', 'Industriekeramik', 'industry', 'Industrie', 240),
  resource('alloys', 'Metalllegierungen', 'industry', 'Industrie', 145),
  resource('machine-parts', 'Maschinenteile', 'industry', 'Industrie', 195),
  resource('electronics', 'Elektronik', 'industry', 'Industrie', 270),
  resource('processor-modules', 'Prozessormodule', 'industry', 'Industrie', 520),
  resource('reactor-parts', 'Reaktorkomponenten', 'industry', 'Industrie', 620),
  resource('ship-parts', 'Schiffskomponenten', 'industry', 'Industrie', 740),
  resource('industry-parts', 'Industriebauteile', 'industry', 'Industrie', 170),

  resource('synthetic-fuel', 'Synthetischer Treibstoff', 'energy-chemistry', 'Energie/Chemie', 132),
  resource('reactor-fuel', 'Reaktorbrennstoff', 'energy-chemistry', 'Energie/Chemie', 215),
  resource('coolant', 'Kühlmittel', 'energy-chemistry', 'Energie/Chemie', 98),
  resource('lubricants', 'Schmierstoffe', 'energy-chemistry', 'Energie/Chemie', 84),
  resource('chemicals', 'Industriechemikalien', 'energy-chemistry', 'Energie/Chemie', 128),
  resource('explosives', 'Explosivstoffe', 'energy-chemistry', 'Energie/Chemie', 280, 'restricted'),
  resource('batteries', 'Batteriezellen', 'energy-chemistry', 'Energie/Chemie', 154),
  resource('plasma-fuel', 'Plasma-Brennstoff', 'energy-chemistry', 'Energie/Chemie', 335),
  resource('refinery-gas', 'Raffineriegas', 'energy-chemistry', 'Energie/Chemie', 72),
  resource('polymers', 'Synthetische Polymere', 'energy-chemistry', 'Energie/Chemie', 118),

  resource('water', 'Trinkwasser', 'supplies', 'Versorgung', 24),
  resource('grain', 'Getreide', 'supplies', 'Versorgung', 32),
  resource('protein', 'Proteinmasse', 'supplies', 'Versorgung', 44),
  resource('meat', 'Fleisch', 'supplies', 'Versorgung', 64),
  resource('vegetables', 'Gemüse', 'supplies', 'Versorgung', 50),
  resource('nutrient-paste', 'Nährstoffpaste', 'supplies', 'Versorgung', 36),
  resource('medical', 'Medizinische Vorräte', 'supplies', 'Versorgung', 225),
  resource('clothing', 'Kleidung', 'supplies', 'Versorgung', 86),
  resource('tools', 'Werkzeuge', 'supplies', 'Versorgung', 112),
  resource('spare-parts', 'Ersatzteile', 'supplies', 'Versorgung', 148),

  resource('ammo', 'Munition', 'military-luxury', 'Militär/Luxus', 180, 'restricted'),
  resource(
    'infantry-weapons',
    'Infanteriewaffen',
    'military-luxury',
    'Militär/Luxus',
    430,
    'restricted'
  ),
  resource('armor-plate', 'Panzerplatten', 'military-luxury', 'Militär/Luxus', 255),
  resource('luxury-food', 'Luxusnahrung', 'military-luxury', 'Militär/Luxus', 325),
  resource('aged-spirits', 'Edle Spirituosen', 'military-luxury', 'Militär/Luxus', 385),
  resource('spices', 'Gewürze', 'military-luxury', 'Militär/Luxus', 295),
  resource('art', 'Kunstgegenstände', 'military-luxury', 'Militär/Luxus', 680),
  resource('antiquities', 'Antiquitäten', 'military-luxury', 'Militär/Luxus', 1200),
  resource(
    'rare-tech',
    'Seltene Technologie',
    'military-luxury',
    'Militär/Luxus',
    1800,
    'restricted'
  ),
  resource('gems', 'Edelsteine', 'military-luxury', 'Militär/Luxus', 760),

  resource('narcotics', 'Synthetische Drogen', 'contraband', 'Schmuggel', 560, 'illegal'),
  resource('alien-artifacts', 'Fremdartige Artefakte', 'contraband', 'Schmuggel', 2400, 'illegal'),
  resource(
    'stolen-data',
    'Gestohlene Datenarchive',
    'contraband',
    'Schmuggel',
    1650,
    'illegal'
  ),
];

const resourceById = new Map(economyResources.map((entry) => [entry.id, entry]));

export function economyResourceById(id: EconomyResourceId): EconomyResourceDefinition | null {
  return resourceById.get(id) ?? null;
}

export function resourceLegality(id: EconomyResourceId): ResourceLegality {
  return economyResourceById(id)?.legality ?? 'legal';
}

export function isIllegalResource(id: EconomyResourceId): boolean {
  return resourceLegality(id) === 'illegal';
}

export function isRestrictedResource(id: EconomyResourceId): boolean {
  return resourceLegality(id) === 'restricted';
}

export function resourceLegalityLabel(id: EconomyResourceId): string {
  const legality = resourceLegality(id);
  if (legality === 'illegal') return 'ILLEGAL';
  if (legality === 'restricted') return 'EINGESCHRÄNKT';
  return 'LEGAL';
}
