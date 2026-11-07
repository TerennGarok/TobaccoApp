// Cigar flavor taxonomy.
//
// Compiled from the common cigar flavor wheels (Cigar Advisor's 176-note wheel,
// Famous Smoke Shop, JR Cigar's "Blending Room", Tobacconist University's
// flavor chart, Corona Cigar, Cigar Inspector) and the vocabulary that recurs
// in published reviews. Families follow the wheel convention: broad family in
// the centre, specific notes on the rim. Every note has a stable `id` so
// reviews, catalog suggestions and the identification service all speak the
// same language.

export interface FlavorNote {
  id: string;
  label: string;
}

export interface FlavorFamily {
  id: string;
  label: string;
  notes: FlavorNote[];
}

const n = (label: string): FlavorNote => ({
  id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  label,
});

export const FLAVOR_FAMILIES: FlavorFamily[] = [
  {
    id: 'earth',
    label: 'Earth & Mineral',
    notes: [n('Earth'), n('Soil'), n('Leather'), n('Mineral'), n('Salt'), n('Mushroom'), n('Barnyard'), n('Musty')],
  },
  {
    id: 'wood',
    label: 'Wood',
    notes: [n('Cedar'), n('Oak'), n('Hickory'), n('Charred Wood'), n('Sandalwood'), n('Pine')],
  },
  {
    id: 'spice',
    label: 'Spice',
    notes: [
      n('Black Pepper'), n('Red Pepper'), n('White Pepper'), n('Cinnamon'), n('Nutmeg'),
      n('Clove'), n('Baking Spice'), n('Anise'), n('Ginger'), n('Cardamom'),
    ],
  },
  {
    id: 'sweet',
    label: 'Sweet',
    notes: [
      n('Honey'), n('Caramel'), n('Molasses'), n('Brown Sugar'), n('Vanilla'), n('Toffee'),
      n('Maple'), n('Butterscotch'), n('Marzipan'),
    ],
  },
  {
    id: 'coffee-cocoa',
    label: 'Coffee & Cocoa',
    notes: [n('Coffee'), n('Espresso'), n('Mocha'), n('Cocoa'), n('Dark Chocolate'), n('Milk Chocolate')],
  },
  {
    id: 'nut',
    label: 'Nut',
    notes: [n('Almond'), n('Cashew'), n('Walnut'), n('Peanut'), n('Chestnut'), n('Hazelnut'), n('Pecan')],
  },
  {
    id: 'cream',
    label: 'Cream & Dairy',
    notes: [n('Cream'), n('Butter'), n('Buttered Popcorn'), n('Custard')],
  },
  {
    id: 'grain',
    label: 'Bread & Grain',
    notes: [n('Toast'), n('Bread'), n('Graham Cracker'), n('Cereal'), n('Malt'), n('Biscuit')],
  },
  {
    id: 'fruit',
    label: 'Fruit',
    notes: [
      n('Dried Fruit'), n('Raisin'), n('Dark Fruit'), n('Cherry'), n('Fig'), n('Date'),
      n('Plum'), n('Citrus'), n('Orange Peel'), n('Apricot'),
    ],
  },
  {
    id: 'floral-herbal',
    label: 'Floral & Herbal',
    notes: [n('Floral'), n('Hay'), n('Grass'), n('Tea'), n('Herbal'), n('Mint'), n('Licorice')],
  },
  {
    id: 'other',
    label: 'Smoke & Other',
    notes: [n('Smoke'), n('Tobacco'), n('Roasted'), n('Char'), n('Barbecue'), n('Metallic')],
  },
];

export const ALL_NOTES: FlavorNote[] = FLAVOR_FAMILIES.flatMap((f) => f.notes);
const BY_ID = new Map(ALL_NOTES.map((note) => [note.id, note]));

export function noteLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

export function familyOf(id: string): FlavorFamily | undefined {
  return FLAVOR_FAMILIES.find((f) => f.notes.some((note) => note.id === id));
}

/** Map free-text flavor words (from the web / reviews) onto taxonomy ids. */
const SYNONYMS: Record<string, string> = {
  pepper: 'black-pepper',
  spice: 'baking-spice',
  spicy: 'baking-spice',
  chocolate: 'cocoa',
  'cocoa-powder': 'cocoa',
  creamy: 'cream',
  creaminess: 'cream',
  nutty: 'almond',
  nuts: 'almond',
  woody: 'cedar',
  wood: 'cedar',
  earthy: 'earth',
  sweetness: 'brown-sugar',
  sugar: 'brown-sugar',
  toasty: 'toast',
  bread: 'bread',
  fruit: 'dried-fruit',
  fruity: 'dried-fruit',
  raisins: 'raisin',
  citrusy: 'citrus',
  orange: 'orange-peel',
  coffee: 'coffee',
  'coffee-bean': 'coffee',
  leathery: 'leather',
  floral: 'floral',
  flowers: 'floral',
  grassy: 'grass',
  'hay': 'hay',
  smoky: 'smoke',
};

export function normalizeFlavor(raw: string): string | undefined {
  const slug = raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (BY_ID.has(slug)) return slug;
  if (SYNONYMS[slug]) return SYNONYMS[slug];
  // Try singular ("almonds" -> "almond")
  const singular = slug.replace(/s$/, '');
  if (BY_ID.has(singular)) return singular;
  return undefined;
}
