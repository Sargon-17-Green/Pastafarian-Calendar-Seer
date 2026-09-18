// Frozen English presentation catalog source:
// Sargon17-Green/Pastafarian-Calendar, branch Fortran+English
// docs/SOURCE_LANGUAGE_CATALOG.md blob faf4b773d2e60ba17d2af387991dbee1c11e7672

export const CUTLET_NAMES = Object.freeze([
  'Bronze', 'Fox', 'Kidney', 'Lagash', 'Thought', 'Four Parts of Nine', 'Palgurash',
  'Papyrus Sedge', 'Cluster', 'Scorpion', 'Ash', 'Wheat', 'River', 'Laughter',
  'Akkad', 'Horn', 'The Empty Jar',
]);

export const MONTH_NAMES = Object.freeze([
  'Clay', 'Pomegranate', 'Elbow', 'Envy', 'Eridu', 'Toothpaste', 'Three Parts of Five',
  'Karshumav', 'Leopard', 'Tin', 'Mist', 'Frankincense', 'Spindle', 'Rib', 'Carob', 'Uruk',
  'Shame', 'Camel', 'Copper', 'Well', 'Yolk', 'Star', 'Honey', 'Spleen', 'Limestone', 'Joy',
  'Fig', 'Nineveh', 'Frog', 'Pitch', 'Lamp', 'The Closed Door', 'Sesame', 'Nape', 'Silver',
  'Susa', 'Storm', 'Donkey', 'Flour', 'Regret', 'Babylon', 'Tongue', 'Flax', 'Salt', 'Pear',
  'Bow', 'Sand',
]);

export function englishName(kind, canonicalIndex) {
  const table = kind === 'cutlet' ? CUTLET_NAMES : kind === 'month' ? MONTH_NAMES : null;
  if (!table || !Number.isInteger(canonicalIndex) || canonicalIndex < 1 || canonicalIndex > table.length) {
    throw new RangeError(`invalid ${kind} canonical index ${canonicalIndex}`);
  }
  return table[canonicalIndex - 1];
}

export function formatEnglish({ year, cutlet, month }) {
  return `Year ${year} — ${cutlet.name}, day ${cutlet.day}; ${month.name}, day ${month.day}`;
}

export const LOCALE_PACK = Object.freeze({
  schemaVersion: 1,
  version: '1.0.0',
  code: 'en',
  name: 'English',
  selfName: 'English',
  direction: 'ltr',
  properNamePolicy: 'localized',
  cutlets: CUTLET_NAMES,
  months: MONTH_NAMES,
  formatDate: formatEnglish,
});
