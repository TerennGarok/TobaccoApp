// Pipe tobacco vocabulary.
import { FLAVOR_FAMILIES, type FlavorFamily } from './flavors';

export const CUTS = [
  'Ribbon', 'Flake', 'Broken Flake', 'Ready Rubbed', 'Coin', 'Plug', 'Rope / Twist',
  'Crumble Cake', 'Cube Cut', 'Shag', 'Navy Roll', 'Mixture',
];

/** Leaf types that make up a blend — the pipe equivalent of wrapper/binder/filler. */
export const COMPONENTS = [
  'Virginia', 'Red Virginia', 'Bright Virginia', 'Burley', 'Latakia', 'Perique',
  'Oriental / Turkish', 'Dark Fired Kentucky', 'Cavendish', 'Black Cavendish',
  'Cigar Leaf', 'Izmir', 'Basma', 'Katerini',
];

export type PipeRatingKey = 'flavor' | 'roomNote' | 'burn' | 'biteFree' | 'consistency';

export const PIPE_RATING_FIELDS: { key: PipeRatingKey; label: string; hint: string }[] = [
  { key: 'flavor', label: 'Flavor', hint: 'Depth, balance, how it develops down the bowl' },
  { key: 'roomNote', label: 'Room note', hint: 'How the smoke smells to others' },
  { key: 'burn', label: 'Burn', hint: 'Stays lit, relights needed, ash' },
  { key: 'biteFree', label: 'Bite-free', hint: '5 = no tongue bite at all' },
  { key: 'consistency', label: 'Consistency', hint: 'Same quality start to finish, tin to tin' },
];

/** Cigar wheel plus the notes pipe smokers reach for most. */
export const PIPE_FLAVOR_FAMILIES: FlavorFamily[] = [
  ...FLAVOR_FAMILIES,
  {
    id: 'pipe',
    label: 'Pipe Specific',
    notes: [
      { id: 'campfire', label: 'Campfire' },
      { id: 'incense', label: 'Incense' },
      { id: 'tangy', label: 'Tangy' },
      { id: 'stewed-fruit', label: 'Stewed Fruit' },
      { id: 'bread-dough', label: 'Bread Dough' },
      { id: 'peat', label: 'Peat' },
      { id: 'rum', label: 'Rum' },
      { id: 'whiskey', label: 'Whiskey' },
      { id: 'cherry-topping', label: 'Cherry (topping)' },
      { id: 'vanilla-topping', label: 'Vanilla (topping)' },
    ],
  },
];

export function moistureLabel(v: number): string {
  if (v < 20) return 'Bone dry';
  if (v < 40) return 'Dry';
  if (v < 60) return 'Just right';
  if (v < 80) return 'Moist';
  return 'Wet';
}
